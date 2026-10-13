import { localSetting } from './localSetting'

// "Show reciprocity" (docs: the reciprocity spec): off hides every direction
// arrow, reason line and balance. Direction is still recorded and still
// shapes the Reach out order either way.
export const SHOW_RECIPROCITY_KEY = 'lg-people-show-reciprocity'
const setting = localSetting(SHOW_RECIPROCITY_KEY, true)

export const isReciprocityShown = setting.get
export const setReciprocityShown = setting.set
export const useShowReciprocity = setting.use

// Phone contacts (docs: the People spec): off by default. While off, no
// import or link entry point shows and the permission is never requested.
export const CONTACTS_ENABLED_KEY = 'lg-people-contacts'
const contacts = localSetting(CONTACTS_ENABLED_KEY, false)

export const setContactsEnabled = contacts.set
export const useContactsEnabled = contacts.use
