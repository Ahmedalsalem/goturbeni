export interface Review {
  id: string
  ride_id: string
  reviewer_id: string
  reviewed_user_id: string
  rating: number
  comment: string | null
  created_at: string
}

export interface ReviewWithReviewer extends Review {
  reviewer: {
    full_name: string | null
    avatar_url: string | null
  } | null
}

export interface ReviewStats {
  averageRating: number | null
  reviewCount: number
}
