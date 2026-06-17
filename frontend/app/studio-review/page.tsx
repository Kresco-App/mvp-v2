import { redirect } from 'next/navigation'

// The review surface moved into the admin panel.
export default function StudioReviewRedirect() {
  redirect('/admin/reviews')
}
