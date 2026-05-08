import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import cron from 'node-cron'
import twilio from 'twilio'
import multer from 'multer'
import Anthropic from '@anthropic-ai/sdk'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join, extname } from 'path'
import crypto from 'crypto'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DATA_DIR = join(__dirname, 'data')
const DATA_FILE = join(DATA_DIR, 'config.json')
const UPLOADS_DIR = join(__dirname, 'uploads')

if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true })
if (!existsSync(UPLOADS_DIR)) mkdirSync(UPLOADS_DIR, { recursive: true })

// ── Storage helpers ──────────────────────────────────────────────────────────

function readConfig() {
  if (!existsSync(DATA_FILE)) return null
  try { return JSON.parse(readFileSync(DATA_FILE, 'utf8')) }
  catch { return null }
}

function writeConfig(config) {
  writeFileSync(DATA_FILE, JSON.stringify(config, null, 2))
}

function recoveryDay(procedureDate) {
  const start = new Date(procedureDate)
  start.setHours(0, 0, 0, 0)
  const now = new Date()
  now.setHours(0, 0, 0, 0)
  return Math.max(1, Math.floor((now - start) / 86400000) + 1)
}

// ── Express setup ────────────────────────────────────────────────────────────

const app = express()
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use('/uploads', express.static(UPLOADS_DIR))

const memUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
})

const photoUpload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS_DIR,
    filename: (req, file, cb) => {
      const ext = extname(file.originalname) || '.jpg'
      cb(null, `${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`)
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    cb(null, file.mimetype.startsWith('image/'))
  },
})

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ── AI helpers ───────────────────────────────────────────────────────────────

async function generateInstructions(procedureType) {
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1200,
    messages: [{
      role: 'user',
      content: `Generate aftercare instructions and recovery details for a patient who just had: ${procedureType}.

Respond with valid JSON only, no markdown, in this exact shape:
{
  "procedureName": "<clean short name for this procedure>",
  "recoveryDays": <integer: typical total recovery days for this procedure>,
  "instructions": "<numbered list of aftercare instructions as plain text with newlines>"
}

For instructions include:
1. Immediate post-procedure care (first 24 hours)
2. Daily care routine
3. What to avoid
4. Expected healing timeline
5. Warning signs that need medical attention

Be concise, actionable, reassuring. Write directly to the patient.`,
    }],
  })

  try {
    return JSON.parse(msg.content[0].text)
  } catch {
    // Fallback if model doesn't return clean JSON
    return {
      procedureName: procedureType,
      recoveryDays: 14,
      instructions: msg.content[0].text,
    }
  }
}

async function generateRecoveryNote(config, dayNum) {
  const pct = Math.min(100, Math.round((dayNum / config.recoveryDays) * 100))
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 400,
    messages: [{
      role: 'user',
      content: `A patient${config.patientName ? ` named ${config.patientName}` : ''} had "${config.procedureName}" on ${config.procedureDate}. They are on day ${dayNum} of ${config.recoveryDays} recovery days (${pct}% through recovery) and just submitted their daily progress photo.

Write a warm, encouraging recovery note in 2-3 short paragraphs:
- What's typically happening at day ${dayNum} for this procedure (skin/tissue response, expected appearance)
- Reassurance that healing takes time and they're on track
- A brief motivating message to keep following aftercare instructions

Be warm, professional, specific to day ${dayNum}, and positive. Do not make specific diagnoses. End with encouragement.`,
    }],
  })
  return msg.content[0].text
}

// ── Reminders ────────────────────────────────────────────────────────────────

async function sendReminderSms(config) {
  const day = recoveryDay(config.procedureDate)
  const uploadUrl = `${process.env.APP_URL}/upload?t=${config.uploadToken}`

  const body = [
    `AfterCare — Day ${day} of ${config.recoveryDays} • ${config.procedureName}`,
    '',
    config.instructions,
    '',
    `📸 Upload today's photo: ${uploadUrl}`,
  ].join('\n')

  await twilioClient.messages.create({
    body,
    from: process.env.TWILIO_PHONE_NUMBER,
    to: config.patientPhone,
  })

  config.reminderLog = config.reminderLog || []
  config.reminderLog.unshift({ type: 'reminder_sent', sentAt: new Date().toISOString(), day })
  if (config.reminderLog.length > 100) config.reminderLog.length = 100
  writeConfig(config)
  console.log(`Reminder sent — Day ${day} at ${new Date().toISOString()}`)
}

// ── Cron scheduler ───────────────────────────────────────────────────────────

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
          console.error('Cron reminder error:', err.message)
        }
      },
      { timezone: config.timezone || 'America/New_York' }
    )
    activeCronJobs.push(job)
  })

  console.log(`Scheduled ${activeCronJobs.length} reminder(s) at ${config.reminderTimes.join(', ')} (${config.timezone})`)
}

const boot = readConfig()
if (boot) scheduleCronJobs(boot)

// ── Admin API routes ─────────────────────────────────────────────────────────

app.get('/api/config', (req, res) => res.json(readConfig() || {}))

app.post('/api/setup', memUpload.single('instructionsFile'), (req, res) => {
  try {
    const {
      patientPhone, doctorPhone, reminderTimes, instructions,
      timezone, procedureName, procedureDate, recoveryDays, patientName,
    } = req.body

    let finalInstructions = (instructions || '').trim()
    if (req.file) {
      const text = req.file.buffer.toString('utf8').replace(/[^\x20-\x7E\n\r\t]/g, '').trim()
      if (text) finalInstructions = text
    }

    if (!patientPhone || !doctorPhone || !finalInstructions || !procedureDate) {
      return res.status(400).json({
        error: 'Patient phone, doctor phone, procedure date, and instructions are required.',
      })
    }

    const times = JSON.parse(reminderTimes || '[]')
    if (!times.length) return res.status(400).json({ error: 'At least one reminder time is required.' })

    const prev = readConfig()
    const config = {
      procedureName: procedureName || 'Procedure',
      patientName: patientName || '',
      patientPhone,
      doctorPhone,
      instructions: finalInstructions,
      procedureDate,
      recoveryDays: Math.max(1, Number(recoveryDays) || 14),
      reminderTimes: times,
      timezone: timezone || 'America/New_York',
      active: true,
      uploadToken: prev?.uploadToken || crypto.randomBytes(16).toString('hex'),
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

app.post('/api/generate-instructions', async (req, res) => {
  try {
    const { procedureType } = req.body
    if (!procedureType?.trim()) return res.status(400).json({ error: 'procedureType is required.' })
    const result = await generateInstructions(procedureType)
    // result = { procedureName, recoveryDays, instructions }
    res.json(result)
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
    if (!config) return res.status(400).json({ error: 'No config saved.' })
    config.active = !config.active
    writeConfig(config)
    scheduleCronJobs(config)
    res.json({ success: true, active: config.active })
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Calendar .ics export
app.get('/api/calendar.ics', (req, res) => {
  const config = readConfig()
  if (!config) return res.status(404).send('No configuration')

  const escDesc = (s) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
  const foldLine = (line) => {
    const out = []
    while (line.length > 75) {
      out.push(line.slice(0, 75))
      line = ' ' + line.slice(75)
    }
    out.push(line)
    return out.join('\r\n')
  }

  const startDate = new Date(config.procedureDate + 'T00:00:00')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//AfterCare//AfterCare App//EN',
    `X-WR-CALNAME:AfterCare — ${config.procedureName}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  config.reminderTimes.forEach((time, i) => {
    const [hour, minute] = time.split(':').map(Number)
    const dt = new Date(startDate)
    dt.setHours(hour, minute, 0, 0)
    const pad = (n) => String(n).padStart(2, '0')
    const dtStr = `${dt.getFullYear()}${pad(dt.getMonth() + 1)}${pad(dt.getDate())}T${pad(hour)}${pad(minute)}00`

    lines.push(
      'BEGIN:VEVENT',
      `UID:aftercare-${i}-${config.uploadToken}@aftercareapp`,
      `DTSTART:${dtStr}`,
      `RRULE:FREQ=DAILY;COUNT=${config.recoveryDays}`,
      'DURATION:PT15M',
      `SUMMARY:AfterCare — ${config.procedureName} (Day reminder)`,
      foldLine(`DESCRIPTION:${escDesc(config.instructions)}`),
      'BEGIN:VALARM',
      'TRIGGER:-PT0M',
      'ACTION:DISPLAY',
      `DESCRIPTION:AfterCare reminder for ${config.procedureName}`,
      'END:VALARM',
      'END:VEVENT',
    )
  })

  lines.push('END:VCALENDAR')

  res.set({
    'Content-Type': 'text/calendar; charset=utf-8',
    'Content-Disposition': `attachment; filename="aftercare-${config.procedureName.replace(/\s+/g, '-').toLowerCase()}.ics"`,
  })
  res.send(lines.join('\r\n'))
})

// ── Patient-facing routes ────────────────────────────────────────────────────

app.get('/api/patient/info', (req, res) => {
  const { t } = req.query
  const config = readConfig()
  if (!config || config.uploadToken !== t) {
    return res.status(403).json({ error: 'This link is invalid or has expired.' })
  }
  const day = recoveryDay(config.procedureDate)
  res.json({
    procedureName: config.procedureName,
    patientName: config.patientName,
    day,
    recoveryDays: config.recoveryDays,
    instructions: config.instructions,
  })
})

app.post('/api/patient/upload', photoUpload.single('photo'), async (req, res) => {
  try {
    const { t } = req.query
    const config = readConfig()
    if (!config || config.uploadToken !== t) {
      return res.status(403).json({ error: 'This link is invalid or has expired.' })
    }
    if (!req.file) return res.status(400).json({ error: 'Please select a photo to upload.' })

    const day = recoveryDay(config.procedureDate)
    const photoUrl = `${process.env.APP_URL}/uploads/${req.file.filename}`

    // Generate AI recovery note
    let note = `Day ${day} of ${config.recoveryDays} — you're making progress! Keep following your aftercare instructions and be patient with the healing process.`
    try {
      note = await generateRecoveryNote(config, day)
    } catch (err) {
      console.error('AI note generation failed:', err.message)
    }

    // Forward photo + note to doctor
    const doctorMsg = [
      `📸 Patient photo update — Day ${day} of ${config.recoveryDays}`,
      config.patientName ? `Patient: ${config.patientName}` : '',
      `Procedure: ${config.procedureName}`,
      '',
      note,
    ].filter(Boolean).join('\n')

    await twilioClient.messages.create({
      body: doctorMsg,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: config.doctorPhone,
      mediaUrl: [photoUrl],
    })

    // Log entry
    config.reminderLog = config.reminderLog || []
    config.reminderLog.unshift({
      type: 'photo_uploaded',
      day,
      photoUrl,
      note,
      uploadedAt: new Date().toISOString(),
    })
    if (config.reminderLog.length > 100) config.reminderLog.length = 100
    writeConfig(config)

    res.json({ success: true, note, day, recoveryDays: config.recoveryDays })
  } catch (err) {
    console.error('Photo upload error:', err)
    res.status(500).json({ error: err.message })
  }
})

// Twilio incoming SMS/MMS (fallback — patient texts photo directly)
app.post('/api/twilio/incoming', async (req, res) => {
  const twiml = (msg) => {
    res.set('Content-Type', 'text/xml')
    res.send(msg ? `<Response><Message>${msg}</Message></Response>` : '<Response></Response>')
  }
  try {
    const { From, Body, NumMedia, MediaUrl0 } = req.body
    const config = readConfig()

    if (config) {
      config.reminderLog = config.reminderLog || []
      config.reminderLog.unshift({
        type: 'sms_photo_received',
        from: From,
        body: Body || '',
        receivedAt: new Date().toISOString(),
        hasMedia: Number(NumMedia) > 0,
        mediaUrl: MediaUrl0 || null,
      })
      if (config.reminderLog.length > 100) config.reminderLog.length = 100
      writeConfig(config)

      if (config.doctorPhone) {
        const fwd = {
          body: `SMS photo from ${From}${Body ? `:\n${Body}` : ''}`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: config.doctorPhone,
        }
        if (Number(NumMedia) > 0 && MediaUrl0) fwd.mediaUrl = [MediaUrl0]
        await twilioClient.messages.create(fwd)
      }
    }

    twiml('Thanks! Your photo has been sent to your doctor.')
  } catch (err) {
    console.error('Incoming webhook error:', err.message)
    twiml('')
  }
})

// Serve React app in production
app.use(express.static(join(__dirname, 'dist')))
app.get(/^(?!\/api\/).*/, (req, res) => {
  res.sendFile(join(__dirname, 'dist', 'index.html'))
})

const PORT = process.env.PORT || 3001
app.listen(PORT, () => console.log(`AfterCare server → http://localhost:${PORT}`))
