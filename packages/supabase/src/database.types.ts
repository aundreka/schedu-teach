export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          activity_id: string
          activity_type: string
          category: Database["public"]["Enums"]["session_category"]
          component_keys: string[]
          created_at: string
          generated_docx_path: string | null
          generated_pdf_path: string | null
          generated_text: string | null
          generation_notes: string | null
          public_id: string
          requirements: Json
          school_id: string
          scope_lesson_ids: string[]
          scope_summary: string | null
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          template_notes: string | null
          template_storage_path: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          activity_id?: string
          activity_type: string
          category: Database["public"]["Enums"]["session_category"]
          component_keys?: string[]
          created_at?: string
          generated_docx_path?: string | null
          generated_pdf_path?: string | null
          generated_text?: string | null
          generation_notes?: string | null
          public_id?: string
          requirements?: Json
          school_id: string
          scope_lesson_ids?: string[]
          scope_summary?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          subject_id: string
          template_notes?: string | null
          template_storage_path?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          activity_id?: string
          activity_type?: string
          category?: Database["public"]["Enums"]["session_category"]
          component_keys?: string[]
          created_at?: string
          generated_docx_path?: string | null
          generated_pdf_path?: string | null
          generated_text?: string | null
          generation_notes?: string | null
          public_id?: string
          requirements?: Json
          school_id?: string
          scope_lesson_ids?: string[]
          scope_summary?: string | null
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          template_notes?: string | null
          template_storage_path?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "activities_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "activities_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      billing_events: {
        Row: {
          amount_cents: number | null
          billing_event_id: string
          currency: string | null
          description: string | null
          event_type: string
          occurred_at: string
          tier: Database["public"]["Enums"]["subscription_tier"] | null
          user_id: string
        }
        Insert: {
          amount_cents?: number | null
          billing_event_id?: string
          currency?: string | null
          description?: string | null
          event_type: string
          occurred_at?: string
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          user_id: string
        }
        Update: {
          amount_cents?: number | null
          billing_event_id?: string
          currency?: string | null
          description?: string | null
          event_type?: string
          occurred_at?: string
          tier?: Database["public"]["Enums"]["subscription_tier"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "billing_events_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      blocks: {
        Row: {
          algorithm_block_key: string
          block_id: string
          block_key: string
          created_at: string
          dependency_keys: string[]
          description: string | null
          end_time: string
          is_locked: boolean
          lesson_id: string | null
          lesson_plan_id: string
          meeting_type: Database["public"]["Enums"]["meeting_type"] | null
          metadata: Json
          order_no: number
          preferred_session_type: string
          pt_subtype: Database["public"]["Enums"]["session_subcategory"] | null
          required: boolean
          root_block_id: string | null
          session_category: Database["public"]["Enums"]["session_category"]
          session_subcategory:
            | Database["public"]["Enums"]["session_subcategory"]
            | null
          slot_id: string | null
          splittable: boolean
          start_time: string
          title: string
          updated_at: string
          ww_subtype: Database["public"]["Enums"]["session_subcategory"] | null
        }
        Insert: {
          algorithm_block_key: string
          block_id?: string
          block_key: string
          created_at?: string
          dependency_keys?: string[]
          description?: string | null
          end_time: string
          is_locked?: boolean
          lesson_id?: string | null
          lesson_plan_id: string
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          metadata?: Json
          order_no?: number
          preferred_session_type?: string
          pt_subtype?: Database["public"]["Enums"]["session_subcategory"] | null
          required?: boolean
          root_block_id?: string | null
          session_category: Database["public"]["Enums"]["session_category"]
          session_subcategory?:
            | Database["public"]["Enums"]["session_subcategory"]
            | null
          slot_id?: string | null
          splittable?: boolean
          start_time: string
          title: string
          updated_at?: string
          ww_subtype?: Database["public"]["Enums"]["session_subcategory"] | null
        }
        Update: {
          algorithm_block_key?: string
          block_id?: string
          block_key?: string
          created_at?: string
          dependency_keys?: string[]
          description?: string | null
          end_time?: string
          is_locked?: boolean
          lesson_id?: string | null
          lesson_plan_id?: string
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          metadata?: Json
          order_no?: number
          preferred_session_type?: string
          pt_subtype?: Database["public"]["Enums"]["session_subcategory"] | null
          required?: boolean
          root_block_id?: string | null
          session_category?: Database["public"]["Enums"]["session_category"]
          session_subcategory?:
            | Database["public"]["Enums"]["session_subcategory"]
            | null
          slot_id?: string | null
          splittable?: boolean
          start_time?: string
          title?: string
          updated_at?: string
          ww_subtype?: Database["public"]["Enums"]["session_subcategory"] | null
        }
        Relationships: [
          {
            foreignKeyName: "blocks_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "blocks_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "blocks_root_block_id_fkey"
            columns: ["root_block_id"]
            isOneToOne: false
            referencedRelation: "blocks"
            referencedColumns: ["block_id"]
          },
          {
            foreignKeyName: "blocks_slot_id_fkey"
            columns: ["slot_id"]
            isOneToOne: false
            referencedRelation: "slots"
            referencedColumns: ["slot_id"]
          },
        ]
      }
      chapters: {
        Row: {
          chapter_id: string
          created_at: string
          description: string | null
          public_id: string
          sequence_no: number
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          title: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          public_id?: string
          sequence_no: number
          status?: Database["public"]["Enums"]["record_status"]
          subject_id: string
          title: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          created_at?: string
          description?: string | null
          public_id?: string
          sequence_no?: number
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          title?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "chapters_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "chapters_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      courses: {
        Row: {
          code: string
          course_id: string
          created_at: string
          description: string | null
          public_id: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at: string
        }
        Insert: {
          code: string
          course_id?: string
          created_at?: string
          description?: string | null
          public_id?: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at?: string
        }
        Update: {
          code?: string
          course_id?: string
          created_at?: string
          description?: string | null
          public_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
        ]
      }
      delays: {
        Row: {
          absent_on: string
          blackout_reason: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at: string
          delay_id: string
          reason: string | null
          school_id: string
          section_id: string | null
          subject_id: string | null
          user_id: string
        }
        Insert: {
          absent_on: string
          blackout_reason?: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at?: string
          delay_id?: string
          reason?: string | null
          school_id: string
          section_id?: string | null
          subject_id?: string | null
          user_id: string
        }
        Update: {
          absent_on?: string
          blackout_reason?: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at?: string
          delay_id?: string
          reason?: string | null
          school_id?: string
          section_id?: string | null
          subject_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delays_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "delays_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "delays_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "delays_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      departments: {
        Row: {
          created_at: string
          department_id: string
          head_user_id: string | null
          name: string
          school_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          department_id?: string
          head_user_id?: string | null
          name: string
          school_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          department_id?: string
          head_user_id?: string | null
          name?: string
          school_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "departments_head_user_id_fkey"
            columns: ["head_user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
          {
            foreignKeyName: "departments_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
        ]
      }
      lesson_plan_versions: {
        Row: {
          blocks_snapshot: Json
          created_at: string
          created_by: string | null
          lesson_plan_id: string
          slots_snapshot: Json
          trigger_description: string | null
          trigger_type: string
          version_id: string
          version_no: number
        }
        Insert: {
          blocks_snapshot: Json
          created_at?: string
          created_by?: string | null
          lesson_plan_id: string
          slots_snapshot: Json
          trigger_description?: string | null
          trigger_type: string
          version_id?: string
          version_no: number
        }
        Update: {
          blocks_snapshot?: Json
          created_at?: string
          created_by?: string | null
          lesson_plan_id?: string
          slots_snapshot?: Json
          trigger_description?: string | null
          trigger_type?: string
          version_id?: string
          version_no?: number
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plan_versions_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
          {
            foreignKeyName: "lesson_plan_versions_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["lesson_plan_id"]
          },
        ]
      }
      lesson_plans: {
        Row: {
          academic_year: string | null
          archived_at: string | null
          created_at: string
          effective_start_date: string | null
          end_date: string
          lesson_plan_id: string
          notes: string | null
          progress_anchor: Json | null
          public_id: string
          school_id: string
          section_id: string
          start_date: string
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          term: string | null
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          academic_year?: string | null
          archived_at?: string | null
          created_at?: string
          effective_start_date?: string | null
          end_date: string
          lesson_plan_id?: string
          notes?: string | null
          progress_anchor?: Json | null
          public_id?: string
          school_id: string
          section_id: string
          start_date: string
          status?: Database["public"]["Enums"]["record_status"]
          subject_id: string
          term?: string | null
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          academic_year?: string | null
          archived_at?: string | null
          created_at?: string
          effective_start_date?: string | null
          end_date?: string
          lesson_plan_id?: string
          notes?: string | null
          progress_anchor?: Json | null
          public_id?: string
          school_id?: string
          section_id?: string
          start_date?: string
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          term?: string | null
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lesson_plans_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "lesson_plans_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "lesson_plans_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "lesson_plans_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      lessons: {
        Row: {
          chapter_id: string
          complexity_score: number | null
          content: string | null
          created_at: string
          estimated_minutes: number | null
          learning_objectives: string | null
          lesson_id: string
          public_id: string
          sequence_no: number
          status: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at: string
        }
        Insert: {
          chapter_id: string
          complexity_score?: number | null
          content?: string | null
          created_at?: string
          estimated_minutes?: number | null
          learning_objectives?: string | null
          lesson_id?: string
          public_id?: string
          sequence_no: number
          status?: Database["public"]["Enums"]["record_status"]
          title: string
          updated_at?: string
        }
        Update: {
          chapter_id?: string
          complexity_score?: number | null
          content?: string | null
          created_at?: string
          estimated_minutes?: number | null
          learning_objectives?: string | null
          lesson_id?: string
          public_id?: string
          sequence_no?: number
          status?: Database["public"]["Enums"]["record_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lessons_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["chapter_id"]
          },
        ]
      }
      paymongo_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload: Json
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload: Json
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload?: Json
          processed_at?: string
        }
        Relationships: []
      }
      plan_subject_content: {
        Row: {
          chapter_id: string | null
          content_level: string
          created_at: string
          estimated_minutes: number | null
          learning_objectives: string | null
          lesson_id: string | null
          lesson_plan_id: string
          plan_subject_content_id: string
          selected_content: string | null
          selected_title: string | null
          sequence_no: number
          subject_id: string
          unit_id: string | null
          updated_at: string
        }
        Insert: {
          chapter_id?: string | null
          content_level: string
          created_at?: string
          estimated_minutes?: number | null
          learning_objectives?: string | null
          lesson_id?: string | null
          lesson_plan_id: string
          plan_subject_content_id?: string
          selected_content?: string | null
          selected_title?: string | null
          sequence_no?: number
          subject_id: string
          unit_id?: string | null
          updated_at?: string
        }
        Update: {
          chapter_id?: string | null
          content_level?: string
          created_at?: string
          estimated_minutes?: number | null
          learning_objectives?: string | null
          lesson_id?: string | null
          lesson_plan_id?: string
          plan_subject_content_id?: string
          selected_content?: string | null
          selected_title?: string | null
          sequence_no?: number
          subject_id?: string
          unit_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_subject_content_chapter_id_fkey"
            columns: ["chapter_id"]
            isOneToOne: false
            referencedRelation: "chapters"
            referencedColumns: ["chapter_id"]
          },
          {
            foreignKeyName: "plan_subject_content_lesson_id_fkey"
            columns: ["lesson_id"]
            isOneToOne: false
            referencedRelation: "lessons"
            referencedColumns: ["lesson_id"]
          },
          {
            foreignKeyName: "plan_subject_content_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["lesson_plan_id"]
          },
          {
            foreignKeyName: "plan_subject_content_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "plan_subject_content_unit_id_fkey"
            columns: ["unit_id"]
            isOneToOne: false
            referencedRelation: "units"
            referencedColumns: ["unit_id"]
          },
        ]
      }
      school_calendar_events: {
        Row: {
          blackout_reason: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string
          event_id: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          is_whole_day: boolean
          school_id: string
          section_id: string | null
          series_key: string | null
          start_date: string
          subject_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          blackout_reason?: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date: string
          event_id?: string
          event_type: Database["public"]["Enums"]["calendar_event_type"]
          is_whole_day?: boolean
          school_id: string
          section_id?: string | null
          series_key?: string | null
          start_date: string
          subject_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          blackout_reason?: Database["public"]["Enums"]["plan_blackout_reason"]
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string
          event_id?: string
          event_type?: Database["public"]["Enums"]["calendar_event_type"]
          is_whole_day?: boolean
          school_id?: string
          section_id?: string | null
          series_key?: string | null
          start_date?: string
          subject_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "school_calendar_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
          {
            foreignKeyName: "school_calendar_events_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "school_calendar_events_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "school_calendar_events_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
        ]
      }
      schools: {
        Row: {
          avatar_color: string
          avatar_url: string | null
          created_at: string
          created_by: string | null
          is_default: boolean
          join_code: string
          name: string
          public_id: string
          school_id: string
          type: Database["public"]["Enums"]["school_type"]
          updated_at: string
        }
        Insert: {
          avatar_color?: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          is_default?: boolean
          join_code?: string
          name: string
          public_id?: string
          school_id?: string
          type?: Database["public"]["Enums"]["school_type"]
          updated_at?: string
        }
        Update: {
          avatar_color?: string
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          is_default?: boolean
          join_code?: string
          name?: string
          public_id?: string
          school_id?: string
          type?: Database["public"]["Enums"]["school_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "schools_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      sections: {
        Row: {
          created_at: string
          grade_level: string | null
          name: string
          public_id: string
          school_id: string
          section_id: string
          status: Database["public"]["Enums"]["record_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          grade_level?: string | null
          name: string
          public_id?: string
          school_id: string
          section_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          grade_level?: string | null
          name?: string
          public_id?: string
          school_id?: string
          section_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sections_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
        ]
      }
      slots: {
        Row: {
          created_at: string
          end_time: string
          is_locked: boolean
          lesson_plan_id: string
          meeting_type: Database["public"]["Enums"]["meeting_type"] | null
          series_key: string
          slot_date: string
          slot_id: string
          slot_number: number
          start_time: string
          title: string | null
          updated_at: string
          weekday: Database["public"]["Enums"]["weekday_name"]
        }
        Insert: {
          created_at?: string
          end_time: string
          is_locked?: boolean
          lesson_plan_id: string
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          series_key: string
          slot_date: string
          slot_id?: string
          slot_number?: number
          start_time: string
          title?: string | null
          updated_at?: string
          weekday: Database["public"]["Enums"]["weekday_name"]
        }
        Update: {
          created_at?: string
          end_time?: string
          is_locked?: boolean
          lesson_plan_id?: string
          meeting_type?: Database["public"]["Enums"]["meeting_type"] | null
          series_key?: string
          slot_date?: string
          slot_id?: string
          slot_number?: number
          start_time?: string
          title?: string | null
          updated_at?: string
          weekday?: Database["public"]["Enums"]["weekday_name"]
        }
        Relationships: [
          {
            foreignKeyName: "slots_lesson_plan_id_fkey"
            columns: ["lesson_plan_id"]
            isOneToOne: false
            referencedRelation: "lesson_plans"
            referencedColumns: ["lesson_plan_id"]
          },
        ]
      }
      stripe_webhook_events: {
        Row: {
          event_id: string
          event_type: string
          payload: Json
          processed_at: string
        }
        Insert: {
          event_id: string
          event_type: string
          payload: Json
          processed_at?: string
        }
        Update: {
          event_id?: string
          event_type?: string
          payload?: Json
          processed_at?: string
        }
        Relationships: []
      }
      subjects: {
        Row: {
          academic_year: string | null
          code: string
          course_id: string | null
          created_at: string
          description: string | null
          public_id: string
          school_id: string
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          subject_image: string | null
          syllabus: string | null
          syllabus_kind: string | null
          syllabus_mime_type: string | null
          title: string
          unit_no: number | null
          updated_at: string
          year: string | null
        }
        Insert: {
          academic_year?: string | null
          code: string
          course_id?: string | null
          created_at?: string
          description?: string | null
          public_id?: string
          school_id: string
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          subject_image?: string | null
          syllabus?: string | null
          syllabus_kind?: string | null
          syllabus_mime_type?: string | null
          title: string
          unit_no?: number | null
          updated_at?: string
          year?: string | null
        }
        Update: {
          academic_year?: string | null
          code?: string
          course_id?: string | null
          created_at?: string
          description?: string | null
          public_id?: string
          school_id?: string
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          subject_image?: string | null
          syllabus?: string | null
          syllabus_kind?: string | null
          syllabus_mime_type?: string | null
          title?: string
          unit_no?: number | null
          updated_at?: string
          year?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subjects_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "subjects_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          paymongo_customer_id: string | null
          paymongo_subscription_id: string | null
          public_id: string
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          subscription_id: string
          tier: Database["public"]["Enums"]["subscription_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          paymongo_customer_id?: string | null
          paymongo_subscription_id?: string | null
          public_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          paymongo_customer_id?: string | null
          paymongo_subscription_id?: string | null
          public_id?: string
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          subscription_id?: string
          tier?: Database["public"]["Enums"]["subscription_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: true
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      units: {
        Row: {
          created_at: string
          description: string | null
          public_id: string
          sequence_no: number
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          title: string
          unit_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          public_id?: string
          sequence_no: number
          status?: Database["public"]["Enums"]["record_status"]
          subject_id: string
          title: string
          unit_id?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          public_id?: string
          sequence_no?: number
          status?: Database["public"]["Enums"]["record_status"]
          subject_id?: string
          title?: string
          unit_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "units_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
        ]
      }
      usage_quotas: {
        Row: {
          ai_generations_used: number
          created_at: string
          period_day: string
          updated_at: string
          usage_quota_id: string
          user_id: string
        }
        Insert: {
          ai_generations_used?: number
          created_at?: string
          period_day: string
          updated_at?: string
          usage_quota_id?: string
          user_id: string
        }
        Update: {
          ai_generations_used?: number
          created_at?: string
          period_day?: string
          updated_at?: string
          usage_quota_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "usage_quotas_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      user_courses: {
        Row: {
          course_id: string
          created_at: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "user_courses_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      user_schools: {
        Row: {
          created_at: string
          department_id: string | null
          is_primary: boolean
          school_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          department_id?: string | null
          is_primary?: boolean
          school_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          department_id?: string | null
          is_primary?: boolean
          school_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_schools_department_id_fkey"
            columns: ["department_id"]
            isOneToOne: false
            referencedRelation: "departments"
            referencedColumns: ["department_id"]
          },
          {
            foreignKeyName: "user_schools_school_id_fkey"
            columns: ["school_id"]
            isOneToOne: false
            referencedRelation: "schools"
            referencedColumns: ["school_id"]
          },
          {
            foreignKeyName: "user_schools_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      user_sections: {
        Row: {
          created_at: string
          section_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          section_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          section_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_sections_section_id_fkey"
            columns: ["section_id"]
            isOneToOne: false
            referencedRelation: "sections"
            referencedColumns: ["section_id"]
          },
          {
            foreignKeyName: "user_sections_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      user_subjects: {
        Row: {
          created_at: string
          subject_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          subject_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          subject_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_subjects_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "subjects"
            referencedColumns: ["subject_id"]
          },
          {
            foreignKeyName: "user_subjects_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["userid"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string
          email: string | null
          first_name: string | null
          last_name: string | null
          onboarded_at: string | null
          publicid: string
          role: Database["public"]["Enums"]["user_role"]
          updated_at: string
          userid: string
          username: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          onboarded_at?: string | null
          publicid: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          userid: string
          username?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          first_name?: string | null
          last_name?: string | null
          onboarded_at?: string | null
          publicid?: string
          role?: Database["public"]["Enums"]["user_role"]
          updated_at?: string
          userid?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_read_user_profile: { Args: { p_target: string }; Returns: boolean }
      create_lesson_plan: {
        Args: {
          p_academic_year?: string
          p_effective_start_date?: string
          p_end_date: string
          p_notes?: string
          p_progress_anchor?: Json
          p_school_id: string
          p_section_id: string
          p_start_date: string
          p_subject_id: string
          p_title: string
        }
        Returns: {
          academic_year: string | null
          archived_at: string | null
          created_at: string
          effective_start_date: string | null
          end_date: string
          lesson_plan_id: string
          notes: string | null
          progress_anchor: Json | null
          public_id: string
          school_id: string
          section_id: string
          start_date: string
          status: Database["public"]["Enums"]["record_status"]
          subject_id: string
          term: string | null
          title: string
          updated_at: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "lesson_plans"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      create_user_subject: {
        Args: { p_subject_id: string }
        Returns: {
          created_at: string
          subject_id: string
          user_id: string
        }
        SetofOptions: {
          from: "*"
          to: "user_subjects"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      current_effective_tier: {
        Args: never
        Returns: Database["public"]["Enums"]["subscription_tier"]
      }
      get_ai_quota_status: {
        Args: never
        Returns: {
          daily_limit: number
          period_day: string
          tier: Database["public"]["Enums"]["subscription_tier"]
          used: number
        }[]
      }
      get_billing_history: {
        Args: never
        Returns: {
          amount_cents: number
          billing_event_id: string
          currency: string
          description: string
          event_type: string
          occurred_at: string
          tier: Database["public"]["Enums"]["subscription_tier"]
        }[]
      }
      get_subscription_status: { Args: never; Returns: Json }
      increment_ai_quota: { Args: never; Returns: number }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_current_user_school_admin: {
        Args: { p_school_id: string }
        Returns: boolean
      }
      join_school_by_code: {
        Args: { p_join_code: string }
        Returns: {
          avatar_color: string
          avatar_url: string | null
          created_at: string
          created_by: string | null
          is_default: boolean
          join_code: string
          name: string
          public_id: string
          school_id: string
          type: Database["public"]["Enums"]["school_type"]
          updated_at: string
        }
        SetofOptions: {
          from: "*"
          to: "schools"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      mark_user_onboarded: { Args: never; Returns: string }
      regenerate_join_code: { Args: { p_school_id: string }; Returns: string }
      sync_lesson_estimated_minutes: {
        Args: { p_lesson_id: string }
        Returns: undefined
      }
      tier_ai_daily_limit: {
        Args: { p_tier: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      tier_ai_monthly_limit: {
        Args: { p_tier: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      tier_lesson_plan_limit: {
        Args: { p_tier: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
      tier_subject_limit: {
        Args: { p_tier: Database["public"]["Enums"]["subscription_tier"] }
        Returns: number
      }
    }
    Enums: {
      academic_term: "quarter" | "trimester" | "semester"
      calendar_event_type:
        | "holiday"
        | "suspension"
        | "school_event"
        | "exam_week"
        | "other"
      meeting_type: "lecture" | "laboratory"
      plan_blackout_reason:
        | "event"
        | "exam_week"
        | "holiday"
        | "leave"
        | "sick"
        | "suspended"
        | "other"
      plan_entry_type:
        | "recurring_class"
        | "planned_item"
        | "moved_item"
        | "cancelled_item"
      record_status: "draft" | "published"
      room_type: "lecture" | "laboratory"
      school_type: "university" | "basic_ed" | "training_center"
      session_category:
        | "lesson"
        | "written_work"
        | "performance_task"
        | "exam"
        | "buffer"
      session_subcategory:
        | "lecture"
        | "laboratory"
        | "assignment"
        | "seatwork"
        | "quiz"
        | "activity"
        | "lab_report"
        | "reporting"
        | "project"
        | "prelim"
        | "midterm"
        | "final"
        | "review"
        | "preparation"
        | "orientation"
        | "other"
      subscription_status: "active" | "canceled" | "past_due" | "expired"
      subscription_tier: "free" | "tier1" | "tier2"
      user_role: "teacher" | "admin" | "superadmin"
      weekday_name:
        | "monday"
        | "tuesday"
        | "wednesday"
        | "thursday"
        | "friday"
        | "saturday"
        | "sunday"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      academic_term: ["quarter", "trimester", "semester"],
      calendar_event_type: [
        "holiday",
        "suspension",
        "school_event",
        "exam_week",
        "other",
      ],
      meeting_type: ["lecture", "laboratory"],
      plan_blackout_reason: [
        "event",
        "exam_week",
        "holiday",
        "leave",
        "sick",
        "suspended",
        "other",
      ],
      plan_entry_type: [
        "recurring_class",
        "planned_item",
        "moved_item",
        "cancelled_item",
      ],
      record_status: ["draft", "published"],
      room_type: ["lecture", "laboratory"],
      school_type: ["university", "basic_ed", "training_center"],
      session_category: [
        "lesson",
        "written_work",
        "performance_task",
        "exam",
        "buffer",
      ],
      session_subcategory: [
        "lecture",
        "laboratory",
        "assignment",
        "seatwork",
        "quiz",
        "activity",
        "lab_report",
        "reporting",
        "project",
        "prelim",
        "midterm",
        "final",
        "review",
        "preparation",
        "orientation",
        "other",
      ],
      subscription_status: ["active", "canceled", "past_due", "expired"],
      subscription_tier: ["free", "tier1", "tier2"],
      user_role: ["teacher", "admin", "superadmin"],
      weekday_name: [
        "monday",
        "tuesday",
        "wednesday",
        "thursday",
        "friday",
        "saturday",
        "sunday",
      ],
    },
  },
} as const
