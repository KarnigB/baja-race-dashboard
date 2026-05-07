export type RaceStatus = 'not_started' | 'running' | 'paused' | 'finished'

export type RaceRow = {
  id: string
  name: string
  duration_seconds: number
  started_at: string | null
  status: RaceStatus
  paused_at: string | null
  total_paused_seconds: number
  created_at: string
  updated_at: string
}

export type LapRow = {
  id: string
  race_id: string
  lap_number: number
  lap_duration_seconds: number
  race_elapsed_seconds: number
  created_at: string
}

export type Database = {
  public: {
    Tables: {
      races: {
        Row: RaceRow
        Insert: {
          id?: string
          name: string
          duration_seconds: number
          started_at?: string | null
          status?: RaceStatus
          paused_at?: string | null
          total_paused_seconds?: number
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Omit<RaceRow, 'id' | 'created_at'>>
        Relationships: []
      }
      laps: {
        Row: LapRow
        Insert: {
          id?: string
          race_id: string
          lap_number: number
          lap_duration_seconds: number
          race_elapsed_seconds: number
          created_at?: string
        }
        Update: Partial<Omit<LapRow, 'id' | 'race_id' | 'created_at'>>
        Relationships: [
          {
            foreignKeyName: 'laps_race_id_fkey'
            columns: ['race_id']
            isOneToOne: false
            referencedRelation: 'races'
            referencedColumns: ['id']
          },
        ]
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
