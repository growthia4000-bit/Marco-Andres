import { NextRequest, NextResponse } from 'next/server'
import { processInboundEmailAction } from '@/features/conversations/actions'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()

    const result = await processInboundEmailAction({
      from: body.From?.Email || body.from || '',
      to: body.To?.[0]?.Email || body.to || '',
      subject: body.Subject || body.subject || '(sin asunto)',
      text: body.Text || body.text || body.TextPart || '',
      html: body.HTML || body.html || body.HTMLPart || '',
      message_id: body.MessageID || body.message_id || '',
      in_reply_to: body.InReplyTo || body.in_reply_to || '',
      references: body.References || body.references || [],
    })

    return NextResponse.json(result, { status: result.status === 'failed' ? 500 : 200 })
  } catch (error) {
    console.error('[email webhook] inbound failed', error)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
