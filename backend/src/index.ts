import express from "express"

const app = express()
const port = 3000

app.get('/api/health', (_req, res) => {
    res.json({ status: 'okkkkkk' })
})

app.listen(port, () => {
    console.log(`Backend listening on port ${port}`)
})
