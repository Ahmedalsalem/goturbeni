export interface Message {
  id: string
  ride_id: string
  sender_id: string
  receiver_id: string
  message: string
  created_at: string
  read_at: string | null
}
