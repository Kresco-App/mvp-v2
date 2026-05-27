import api from './axios'

export type ProfileUser = {
  id: number
  email: string
  full_name: string
  avatar_url: string
  banner_url?: string
  role: string
  is_staff: boolean
  is_pro: boolean
  niveau: string
  filiere: string
  is_email_verified: boolean
  created_at: string
}

export type ProfileUpdateInput = Partial<Pick<ProfileUser, 'full_name' | 'avatar_url' | 'banner_url' | 'niveau' | 'filiere'>>

export class ProfileFeatureUnavailableError extends Error {
  constructor(message = 'This profile feature is not available from the API yet.') {
    super(message)
    this.name = 'ProfileFeatureUnavailableError'
  }
}

export async function getMyProfile() {
  const { data } = await api.get<ProfileUser>('/profile/me')
  return data
}

export async function updateMyProfile(input: ProfileUpdateInput) {
  const { data } = await api.patch<ProfileUser>('/profile/me', input)
  return data
}

export async function uploadProfileMedia(kind: 'avatar' | 'banner', file: File) {
  const form = new FormData()
  form.append('file', file)

  try {
    const { data } = await api.post<{ avatar_url?: string; banner_url?: string; url?: string }>(`/profile/me/media/${kind}`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    })

    const mediaUrl = data.url || data.avatar_url || data.banner_url
    if (!mediaUrl) throw new Error('Upload succeeded but did not return an image URL.')
    return mediaUrl
  } catch (error) {
    const status = (error as { response?: { status?: number } })?.response?.status
    if (status && [404, 405, 501].includes(status)) {
      throw new ProfileFeatureUnavailableError(`${kind === 'avatar' ? 'Avatar' : 'Banner'} upload is not available yet. Paste an image URL instead.`)
    }
    throw error
  }
}

export async function uploadProfileAvatar(file: File) {
  return uploadProfileMedia('avatar', file)
}
