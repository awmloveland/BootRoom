import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

// The design handoff folder is a prototype bundle for reference, not app code
const config = [...nextCoreWebVitals, { ignores: ['design_handoff_teammates_chart/**'] }]

export default config
