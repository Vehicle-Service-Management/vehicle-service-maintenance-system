export async function checkApiHealth(): Promise<boolean> {
  const response = await fetch('/health', {
    headers: { Accept: 'application/json' },
  })

  if (!response.ok) return false

  const payload: unknown = await response.json()
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'status' in payload &&
    payload.status === 'ok'
  )
}
