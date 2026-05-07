export type RaceStatus = 'not_started' | 'running' | 'paused' | 'finished'
export type StopEventType = 'pit_in' | 'pit_out' | 'paddock_in' | 'paddock_out'
export type IssueSeverity = 'info' | 'watch' | 'critical'
export type TeamStatus = 'on_track' | 'in_pit' | 'in_paddock' | 'unknown' | 'retired'

export type RaceRow = {
  id: string
  name: string
  duration_seconds: number
  target_lap_seconds: number | null
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

export type StopEventRow = {
  id: string
  race_id: string
  event_type: StopEventType
  race_elapsed_seconds: number
  note: string | null
  created_at: string
}

export type DriverRow = {
  id: string
  race_id: string
  name: string
  created_at: string
  updated_at: string
}

export type StintRow = {
  id: string
  race_id: string
  driver_id: string
  start_elapsed_seconds: number
  end_elapsed_seconds: number | null
  start_lap_number: number
  end_lap_number: number | null
  created_at: string
  ended_at: string | null
}

export type IssueLogRow = {
  id: string
  race_id: string
  severity: IssueSeverity
  message: string
  resolved: boolean
  created_at: string
  updated_at: string
  resolved_at: string | null
}

export type TrackedTeamRow = {
  id: string
  race_id: string
  school_name: string
  car_number: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type TeamStatusEventRow = {
  id: string
  race_id: string
  team_id: string
  status: TeamStatus
  note: string | null
  created_at: string
}

type Relationship = {
  foreignKeyName: string
  columns: string[]
  isOneToOne?: boolean
  referencedRelation: string
  referencedColumns: string[]
}

type Table<Row, Insert, Update, Relationships extends Relationship[] = []> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: Relationships
}

type RaceScopedInsert = {
  id?: string
  race_id: string
  created_at?: string
}

type RaceRelationship = [
  {
    foreignKeyName: string
    columns: ['race_id']
    isOneToOne: false
    referencedRelation: 'races'
    referencedColumns: ['id']
  },
]

export type Database = {
  public: {
    Tables: {
      races: Table<
        RaceRow,
        {
          id?: string
          name: string
          duration_seconds: number
          target_lap_seconds?: number | null
          started_at?: string | null
          status?: RaceStatus
          paused_at?: string | null
          total_paused_seconds?: number
          created_at?: string
          updated_at?: string
        },
        Partial<Omit<RaceRow, 'id' | 'created_at'>>
      >
      laps: Table<
        LapRow,
        RaceScopedInsert & {
          lap_number: number
          lap_duration_seconds: number
          race_elapsed_seconds: number
        },
        Partial<Omit<LapRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      stop_events: Table<
        StopEventRow,
        RaceScopedInsert & {
          event_type: StopEventType
          race_elapsed_seconds: number
          note?: string | null
        },
        Partial<Omit<StopEventRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      drivers: Table<
        DriverRow,
        RaceScopedInsert & {
          name: string
          updated_at?: string
        },
        Partial<Omit<DriverRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      stints: Table<
        StintRow,
        RaceScopedInsert & {
          driver_id: string
          start_elapsed_seconds: number
          end_elapsed_seconds?: number | null
          start_lap_number: number
          end_lap_number?: number | null
          ended_at?: string | null
        },
        Partial<Omit<StintRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      issue_logs: Table<
        IssueLogRow,
        RaceScopedInsert & {
          severity: IssueSeverity
          message: string
          resolved?: boolean
          updated_at?: string
          resolved_at?: string | null
        },
        Partial<Omit<IssueLogRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      tracked_teams: Table<
        TrackedTeamRow,
        RaceScopedInsert & {
          school_name: string
          car_number: string
          notes?: string | null
          updated_at?: string
        },
        Partial<Omit<TrackedTeamRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
      team_status_events: Table<
        TeamStatusEventRow,
        RaceScopedInsert & {
          team_id: string
          status: TeamStatus
          note?: string | null
        },
        Partial<Omit<TeamStatusEventRow, 'id' | 'race_id' | 'created_at'>>,
        RaceRelationship
      >
    }
    Views: Record<string, never>
    Functions: Record<string, never>
    Enums: Record<string, never>
    CompositeTypes: Record<string, never>
  }
}
