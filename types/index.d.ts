export type Mood = 'idle' | 'thinking' | 'working' | 'speaking'

export type Live = {
  mood: Mood
  activity: string
  log: string[]
  last: string
  experts: string[]
  at: number
}

declare module 'claude-code' {
  interface PluginState {
    alter: { live: Shaped<Live> }
  }
}
