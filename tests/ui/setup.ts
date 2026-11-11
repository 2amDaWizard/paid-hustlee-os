import '@testing-library/jest-dom/vitest'
import {afterEach,vi} from 'vitest'
import {cleanup} from '@testing-library/react'
afterEach(()=>{cleanup();localStorage.clear();sessionStorage.clear();vi.restoreAllMocks()})
window.scrollTo=vi.fn()
window.ResizeObserver=class {observe(){}unobserve(){}disconnect(){}}
Object.defineProperty(window,'matchMedia',{value:()=>({matches:false,addEventListener(){},removeEventListener(){}})})
