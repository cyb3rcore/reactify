export const rsc = true

async function fetchItems() {
  return ['Item A', 'Item B', 'Item C']
}

export default async function UsingData() {
  const items = await fetchItems()
  return (
    <div>
      <h2>Data Fetching in RSC</h2>
      <ul>
        {items.map((item) => <li key={item}>{item}</li>)}
      </ul>
    </div>
  )
}
