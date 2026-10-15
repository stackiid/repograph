import { createProjectStore } from '../../core/persistence/store'

/** One shared store. It opens the database lazily, so nothing touches storage until the user acts. */
export const projectStore = createProjectStore()
