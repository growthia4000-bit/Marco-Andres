import { createOpenRouter } from '@openrouter/ai-sdk-provider'

export const AI_MODELS = {
  fast: 'google/gemini-2.0-flash-001',
  balanced: 'google/gemini-2.0-flash-001',
} as const

export type AiModelKey = keyof typeof AI_MODELS

export function hasAiProviderConfig() {
  return Boolean(process.env.OPENROUTER_API_KEY?.trim())
}

export function getOpenRouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()

  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY is not configured')
  }

  return createOpenRouter({
    apiKey,
    headers: {
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
      ...(process.env.NEXT_PUBLIC_SITE_NAME ? { 'X-Title': process.env.NEXT_PUBLIC_SITE_NAME } : {}),
    },
  })
}
