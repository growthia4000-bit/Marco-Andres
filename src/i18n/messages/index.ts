import en from './en'
import es from './es'
import it from './it'

export const messages = { es, it, en }

export interface MessageDictionary {
  [key: string]: string | MessageDictionary
}
