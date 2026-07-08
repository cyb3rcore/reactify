export function configure(scope: any) {
  scope.decorate('testDecorator', 'configured')
}

export default function Configured() {
  return <p>Configured route</p>
}
