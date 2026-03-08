export type { SketchDef, ParamDef } from './types'
export { warp }    from './warp'
export { cells }   from './cells'
export { ripple }  from './ripple'
export { marble }  from './marble'
export { crystal } from './crystal'

import { warp }    from './warp'
import { cells }   from './cells'
import { ripple }  from './ripple'
import { marble }  from './marble'
import { crystal } from './crystal'
import type { SketchDef } from './types'

export const SKETCHES: SketchDef[] = [warp, cells, ripple, marble, crystal]
