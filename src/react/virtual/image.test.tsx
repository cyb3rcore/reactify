// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest'
import { render } from '@testing-library/react'
import Image from './image.js'

describe('Image', () => {
  it('renders an img with src and alt', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" />)
    const img = container.querySelector('img')
    expect(img).toBeTruthy()
    expect(img?.getAttribute('alt')).toBe('test')
  })

  it('sets default loading="lazy" and decoding="async"', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('loading')).toBe('lazy')
    expect(img.getAttribute('decoding')).toBe('async')
  })

  it('generates responsive srcset with w-descriptors when sizes provided', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" sizes="100vw" />)
    const img = container.querySelector('img')!
    const srcset = img.getAttribute('srcset')
    expect(srcset).toContain('photo.jpg?w=640&q=80 640w')
    expect(srcset).toContain('photo.jpg?w=1200&q=80 1200w')
    expect(srcset).toContain('photo.jpg?w=3840&q=80 3840w')
  })

  it('generates fixed srcset with x-descriptors when width provided', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" width={400} />)
    const img = container.querySelector('img')!
    const srcset = img.getAttribute('srcset')
    expect(srcset).toContain('photo.jpg?w=400&q=80 1x')
    expect(srcset).toContain('photo.jpg?w=800&q=80 2x')
    expect(srcset).not.toContain('3x') // Next.js rationale: 3x is wasteful on OLED
  })

  it('renders preload link when preload=true', () => {
    render(<Image src="photo.jpg" alt="test" preload sizes="100vw" />)
    const link = document.querySelector('link[rel="preload"]')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('as')).toBe('image')
    expect(link?.getAttribute('imagesrcset')).toContain('640w')
  })

  it('renders preload href for fixed-width images without sizes', () => {
    render(<Image src="photo.jpg" alt="test" preload width={400} />)
    const link = document.querySelector('link[rel="preload"]')
    expect(link).toBeTruthy()
    expect(link?.getAttribute('href')).toContain('w=400')
    expect(link?.getAttribute('imagesrcset')).toBeNull()
  })

  it('calls onLoad callback once even with re-renders', () => {
    const onLoad = vi.fn()
    const { container } = render(<Image src="photo.jpg" alt="test" onLoad={onLoad} />)
    const img = container.querySelector('img')!
    img.dispatchEvent(new Event('load'))
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(1)
  })

  it('allows onLoad pass-through when src changes', () => {
    const onLoad = vi.fn()
    const { container, rerender } = render(<Image src="photo.jpg" alt="test" onLoad={onLoad} />)
    const img = container.querySelector('img')!
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(1)
    rerender(<Image src="photo2.jpg" alt="test" onLoad={onLoad} />)
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(2)
    // Third dispatch should be deduped (loadedRef reset worked for new src)
    img.dispatchEvent(new Event('load'))
    expect(onLoad).toHaveBeenCalledTimes(2)
  })

  it('merges params into query string', () => {
    const { container } = render(
      <Image src="photo.jpg" alt="test" width={200} params={{ blur: 5, bw: true }} />,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toContain('blur=5')
    expect(img.getAttribute('src')).toContain('bw=true')
  })

  it('uses custom loader when provided', () => {
    const customLoader = ({ src, width }: { src: string; width: number }) =>
      `/custom/${src}?size=${width}`
    const { container } = render(
      <Image src="photo.jpg" alt="test" width={200} loader={customLoader} />,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('/custom/photo.jpg?size=200')
  })

  it('uses unoptimized src as-is when unoptimized=true', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" unoptimized />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('photo.jpg')
    expect(img.getAttribute('srcset')).toBeFalsy()
  })

  it('fill mode sets absolute positioning styles', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" fill />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('style')).toContain('position: absolute')
    expect(img.getAttribute('style')).toContain('inset: 0')
  })

  it('sets quality in generated URLs', () => {
    const { container } = render(<Image src="photo.jpg" alt="test" width={200} quality={50} />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toContain('q=50')
  })
})
