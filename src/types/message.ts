export type MessageType = "text" | "location"

export interface Message {
  id: string
  ride_id: string
  sender_id: string
  receiver_id: string
  message: string
  message_type: MessageType
  location_lat: number | null
  location_lng: number | null
  created_at: string
  read_at: string | null
  edited_at: string | null
  deleted_at: string | null
}
