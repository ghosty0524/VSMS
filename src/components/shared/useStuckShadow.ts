import { useEffect, useRef } from 'react'

/**
 * sticky 元素被「卡住」時給它一道陰影（index.css 的 .pin / .pin-y），
 * 讓「內容正從它底下經過」讀得出來。
 *
 * 適用於「捲動容器不歸自己管」的情況 —— 統計頁的 sticky 篩選列就是這樣，
 * 那個 `h-full overflow-y-auto` 在 App.tsx 裡，元件本身拿不到節點。
 * 甘特圖與列表視圖各自有現成的 scroll handler，直接在裡面切 class 即可，
 * 不需要這個 hook。
 *
 * 為什麼不用 IntersectionObserver 加哨兵（那是這種需求的常見寫法）——
 * 開發預覽環境不會送出 observer 的 callback，等於無法驗證它到底有沒有動。
 * 往上找捲動祖先、掛一個 passive 的 scroll listener，行為跟甘特圖那套一致，
 * 而且看得到、測得到。callback 只做一次 classList.toggle，不進 React。
 */
function findScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null
  while (node) {
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) {
      return node
    }
    node = node.parentElement
  }
  return null
}

export function useStuckShadow<T extends HTMLElement>() {
  const targetRef = useRef<T>(null)

  useEffect(() => {
    const target = targetRef.current
    if (!target) return

    // 捲動祖先要等內容渲染出來才量得到高度，所以在 effect 裡才找
    const scroller = findScrollParent(target)
    if (!scroller) return

    const sync = () => target.classList.toggle('pin-y', scroller.scrollTop > 0)
    sync()
    scroller.addEventListener('scroll', sync, { passive: true })
    return () => scroller.removeEventListener('scroll', sync)
  }, [])

  return { targetRef }
}
