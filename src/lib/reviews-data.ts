export interface Review {
  id: string;
  authorName: string;
  authorPhotoUrl?: string;
  rating: number;
  text: string;
  relativeTime: string;
  images?: string[];
}

export interface BusinessInfo {
  name: string;
  address: string;
  totalReviews: number;
  averageRating: number;
}
