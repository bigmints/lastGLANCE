import { Mail, MessageSquare, MoreHorizontal, Phone, Users, Video, type LucideIcon } from 'lucide-react'
import type { InteractionChannel } from '@/people/types'

export const CHANNEL_ICONS: Record<InteractionChannel, LucideIcon> = {
  in_person: Users,
  call: Phone,
  video: Video,
  text: MessageSquare,
  email: Mail,
  other: MoreHorizontal,
}

export const CHANNEL_LABEL_KEYS: Record<InteractionChannel, string> = {
  in_person: 'people.channel.in_person',
  call: 'people.channel.call',
  video: 'people.channel.video',
  text: 'people.channel.text',
  email: 'people.channel.email',
  other: 'people.channel.other',
}
