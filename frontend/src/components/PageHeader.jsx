export function PageHeader({ title, subtitle, badge, actions }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-border-button-default">
      <div>
        <div className="flex items-center gap-2.5">
          <h1 className="text-title-2-bold text-text-primary tracking-tight">
            {title}
          </h1>
          {badge && <div>{badge}</div>}
        </div>
        {subtitle && (
          <p className="mt-1 text-body-small text-text-secondary">
            {subtitle}
          </p>
        )}
      </div>

      {actions && (
        <div className="flex flex-wrap items-center gap-2.5">
          {actions}
        </div>
      )}
    </div>
  );
}
