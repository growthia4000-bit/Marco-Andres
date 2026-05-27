import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { customProvider, wrapLanguageModel, defaultSettingsMiddleware, gateway } from 'ai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'

export type LLMProvider = 'openai' | 'openrouter'

export interface LLMProviderInfo {
  provider: LLMProvider
  model: string
  configured: boolean
  reason?: string
}

function getOpenAIProvider() {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) {
    return null
  }
  
  return createOpenAICompatible({
    name: 'openai',
    baseURL: process.env.OPENAI_BASE_URL?.trim() || 'https://api.openai.com/v1',
    apiKey,
    headers: {
      'AISDK-Badge': 'Growthia Global CRM',
    },
  })
}

function getOpenRouterProvider() {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()
  if (!apiKey) {
    return null
  }
  
  return createOpenRouter({
    apiKey,
    headers: {
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
      ...(process.env.NEXT_PUBLIC_SITE_NAME ? { 'X-Title': process.env.NEXT_PUBLIC_SITE_NAME } : {}),
    },
  })
}

export function getLLMProviderConfig(): LLMProviderInfo {
  const provider = (process.env.LLM_PROVIDER || 'openai').toLowerCase() as LLMProvider
  
  if (provider === 'openai') {
    const openaiProvider = getOpenAIProvider()
    if (!openaiProvider) {
      return {
        provider: 'openai',
        model: process.env.LLM_MODEL || 'gpt-4.1-mini',
        configured: false,
        reason: 'OPENAI_API_KEY no configurada',
      }
    }
    return {
      provider: 'openai',
      model: process.env.LLM_MODEL || 'gpt-4.1-mini',
      configured: true,
    }
  }
  
  if (provider === 'openrouter') {
    const openrouterProvider = getOpenRouterProvider()
    if (!openrouterProvider) {
      return {
        provider: 'openrouter',
        model: process.env.LLM_MODEL || 'openrouter/free',
        configured: false,
        reason: 'OPENROUTER_API_KEY no configurada',
      }
    }
    return {
      provider: 'openrouter',
      model: process.env.LLM_MODEL || 'openrouter/free',
      configured: true,
    }
  }
  
  return {
    provider: 'openai',
    model: 'gpt-4.1-mini',
    configured: false,
    reason: `Proveedor desconocido: ${provider}`,
  }
}

export function hasLLMConfig(): boolean {
  return getLLMProviderConfig().configured
}

export function getLLMProvider() {
  const config = getLLMProviderConfig()
  
  if (!config.configured) {
    throw new Error(`LLM no configurado: ${config.reason}`)
  }
  
  if (config.provider === 'openai') {
    const openaiProvider = getOpenAIProvider()
    if (!openaiProvider) {
      throw new Error('OpenAI no configurado')
    }
    return wrapLanguageModel({
      model: openaiProvider(config.model),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: 2048,
        },
      }),
    })
  }
  
  if (config.provider === 'openrouter') {
    const openrouterProvider = getOpenRouterProvider()
    if (!openrouterProvider) {
      throw new Error('OpenRouter no configurado')
    }
    return wrapLanguageModel({
      model: openrouterProvider(config.model),
      middleware: defaultSettingsMiddleware({
        settings: {
          maxOutputTokens: 2048,
        },
      }),
    })
  }
  
  throw new Error(`Proveedor LLM no soportado: ${config.provider}`)
}

export function getLLMModelString(): string {
  const config = getLLMProviderConfig()
  return config.model
}

export const LLM_DEFAULTS = {
  provider: 'openai' as LLMProvider,
  model: 'gpt-4.1-mini',
  fallbackModel: 'openrouter/free',
} as const