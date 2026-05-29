import { useRef } from 'react';

type GanttLayoutProps<T> = {
  rows: T[];
  renderLeft: (row: T) => React.ReactNode;
  renderRight: (row: T) => React.ReactNode;
  rowHeight?: number;
};

export default function GanttLayout<T>({
  rows,
  renderLeft,
  renderRight,
  rowHeight = 44,
}: GanttLayoutProps<T>) {
  const leftRef = useRef<HTMLDivElement>(null);
  const rightRef = useRef<HTMLDivElement>(null);

  const syncScroll = () => {
    if (leftRef.current && rightRef.current) {
      leftRef.current.scrollTop = rightRef.current.scrollTop;
    }
  };

  return (
    <div className="flex w-full h-full overflow-hidden">
      {/* 左側固定工作排程欄 */}
      <div
        ref={leftRef}
        className="w-[300px] shrink-0 bg-white border-r overflow-hidden"
      >
        {rows.map((row, i) => (
          <div
            key={i}
            className="flex items-center px-2 border-b"
            style={{ height: rowHeight }}
          >
            {renderLeft(row)}
          </div>
        ))}
      </div>

      {/* 右側時間軸 + bars */}
      <div
        ref={rightRef}
        onScroll={syncScroll}
        className="flex-1 overflow-x-auto overflow-y-auto"
      >
        <div className="min-w-max">
          {rows.map((row, i) => (
            <div
              key={i}
              className="border-b flex items-center"
              style={{ height: rowHeight }}
            >
              {renderRight(row)}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
