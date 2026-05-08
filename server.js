import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import twilio from 'twilio'
import multer from 'multer'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'config.json')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR)

function readConfig() {
  if (!existsSync(DATA_FILE)) return null
  try {
    return JSON.parse(readFileSync(DATA_FILE, 'utf8'))
  } catch {
    return null
  }
}

function writeConfig(config) {
  writeFileSync(DATA_FILE, JSON.stringify(config, null, 2))
}

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } })

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

async function sendReminderSms(config) {
  const body =
    `AfterCare Reminder — ${config.procedureName}\n\n` +
    `${config.instructions}\n\n` +
    `Reply with a photo to send an update to your doctor.`

  await twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: config.patientPhone,
  })

  config.reminderLog = config.reminderLog || []
  config.reminderLog.unshift({ type: 'reminder_sent', sentAt: new Date().toISOString() })
  if (config.reminderLog.length > 100) config.reminderLog.length = 100
  writeConfig(config)
  console.log(`Reminder sent to ${config.patientPhone} at ${new Date().toISOString()}`)
}

let activeCronJobs = []

function scheduleCronJobs(config) {
  activeCronJobs.forEach(j => j.stop())
  activeCronJobs = []

  if (!config?.active || !config.reminderTimes?.length) return

  config.reminderTimes.forEach(time => {
    const [hour, minute] = time.split(':')
    const job = cron.schedule(
      `${Number(minute)} ${Number(hour)} * * *`,
      async () => {
        try {
          const current = readConfig()
          if (current?.active) await sendReminderSms(current)
        } catch (err) {
          console.error('Scheduled reminder error:', err.message)
        }
      },
      { timezone: config.timezone || 'America/New_York' }
    )
    activeCronJobs.push(job)
  })

  console.log(
    `Scheduled ${activeCronJobs.length} daily reminder(s) at: ${config.reminderTimes.join(', ')} (${config.timezone})`
  )
}

// Resume jobs on restart
const boot = readConfig()
if (boot) scheduleCronJobs(boot)

// ── Routes ──────────────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => {
  res.json(readConfig() || {})
})

app.post('/api/setup', upload.single('instructionsFile'), (req, res) => {
  try {
    const { patientPhone, doctorPhone, reminderTimes, instructions, timezone, procedureName } = req.body

    let finalInstructions = (instructions || '').trim()
    if (req.file) {
      // Plain-text file — store as-is; PDF binary will appear garbled but we accept txt uploads
      const text = req.file.buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, '').trim()
      if (text) finalInstructions = text
    }

    if (!patientPhone || !doctorPhone || !finalInstructions) {
      return res.status(400).json({ error: 'Patient phone, doctor phone, and instructions are required.' })
    }

    const times = JSON.parse(reminderTimes || '[]')
    if (!times.length) return res.status(400).json({ error: 'At least one reminder time is required.' })

    const prev = readConfig()
    const config = {
      procedureName: procedureName || 'Procedure',
      patientPhone,
      doctorPhone,
      instructions: finalInstructions,
      reminderTimes: times,
      timezone: timezone || 'America/New_York',
      active: true,
      createdAt: new Date().toISOString(),
      reminderLog: prev?.reminderLog || [],
    }

    writeConfig(config)
    scheduleCronJobs(config)
    res.json({ success: true, config })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/send-reminder', async (req, res) => {
  try {
    const config = readConfig()
    if (!config) return res.status(400).json({ error: 'No configuration saved yet.' })
    await sendReminderSms(config)
    res.json({ success: true })
  } catch (err) {
    console.error(err)
    res.status(500).json({ error: err.message })
  }
})

app.post('/api/toggle-active', (req, res) => {
  try {
    const config = readConfig()
    if (!config) return res.status(400).json({ error: 'No configuration saved yet.' })
    config.active = !config.active
    writeConfig(config)
    scheduleCronJobs(config)
    res.json({ success: true, active: config.active })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Twilio webhook — patient replies with photo → forward to doctor
app.post('/api/twilio/incoming', async (req, res) => {
  const twiml = (msg) => {
    res.set('Content-Type', 'text/xml')
    res.send(msg ? `<Response><Message>${msg}</Message></Response>` : '<Response></Response>')
  }

  try {
    const { From, Body, NumMedia, MediaUrl0, MediaContentType0 } = req.body
    const config = readConfig()

    const entry = {
      type: 'photo_received',
      from: From,
      body: Body || '',
      receivedAt: new Date().toISOString(),
      hasMedia: Number(NumMedia) > 0,
      mediaUrl: MediaUrl0 || null,
      mediaType: MediaContentType0 || null,
    }

    if (config) {
      config.reminderLog = config.reminderLog || []
      config.reminderLog.unshift(entry)
      if (config.reminderLog.length > 100) config.reminderLog.length = 100
      writeConfig(config)

      if (config.doctorPhone) {
        const fwd = {
          body: `Patient photo update from ${From}${Body ? `:\n${Body}` : ''}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: config.doctorPhone,
        }
        if (Number(NumMedia) > 0 && MediaUrl0) fwd.mediaUrl = [MediaUrl0]
        await twilioClient.messages.create(fwd)
      }
    }

    twiml('Thanks! Your update has been sent to your doctor.')
  } catch (err) {
    console.error('Incoming webhook error:', err.message)
    twiml('')
  }
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`AfterCare server running on http://localhost:${PORT}`))
