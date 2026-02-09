export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      employees: {
        Row: {
          id: string
          employee_number: string
          full_name: string
          work_email: string
          gender: string | null
          mobile_phone: string | null
          location: string | null
          business_unit: string
          department: string | null
          sub_department: string | null
          job_title: string | null
          secondary_job_title: string | null
          reporting_manager_emp_number: string | null
          date_joined: string | null
          employment_status: string
          exit_date: string | null
          is_placeholder: boolean
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          employee_number: string
          full_name: string
          work_email: string
          gender?: string | null
          mobile_phone?: string | null
          location?: string | null
          business_unit: string
          department?: string | null
          sub_department?: string | null
          job_title?: string | null
          secondary_job_title?: string | null
          reporting_manager_emp_number?: string | null
          date_joined?: string | null
          employment_status?: string
          exit_date?: string | null
          is_placeholder?: boolean
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          employee_number?: string
          full_name?: string
          work_email?: string
          gender?: string | null
          mobile_phone?: string | null
          location?: string | null
          business_unit?: string
          department?: string | null
          sub_department?: string | null
          job_title?: string | null
          secondary_job_title?: string | null
          reporting_manager_emp_number?: string | null
          date_joined?: string | null
          employment_status?: string
          exit_date?: string | null
          is_placeholder?: boolean
          created_at?: string
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          employee_id: string
          email: string
          password_hash: string
          is_first_login: boolean
          last_login: string | null
          role: string
          created_at: string
          updated_at: string
        }
      }
      sales_data: {
        Row: {
          id: string
          employee_email: string | null
          employee_name: string | null
          employee_id: string | null
          business_unit: string
          arn: string | null
          partner_name: string | null
          rm_name: string | null
          bm_name: string | null
          rgm_name: string | null
          zm_name: string | null
          mf_sif_msci: number
          cob_100: number
          cob_50: number
          aif_pms_las_trail: number
          mf_total_cob_100: number
          mf_total_cob_50: number
          alternate: number
          alt_total: number
          total_net_sales_cob_100: number
          total_net_sales_cob_50: number
          branch: string | null
          zone: string | null
          data_date: string
          data_period: string
          created_at: string
          updated_at: string
        }
      }
      rankings: {
        Row: {
          id: string
          employee_id: string
          business_unit: string
          parameter_name: string
          period_type: string
          achievement_value: number
          target_value: number
          achievement_pct: number
          shortfall: number
          rank_vertical: number
          calculation_date: string
          created_at: string
        }
      }
    }
  }
}
