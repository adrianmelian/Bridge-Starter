import type { WorkspaceEntity } from '../types'
import { entityHash } from '../lib/route'
import { categoryIcon } from '../lib/categories'
import { contentUrl } from '../desktop/client'

/**
 * The design-system card: glass surface over the aura, gradient edge
 * (pink→purple; amber when pinned), glow + lift on hover. Building
 * block of the home grid; mirrored as `.data-card` in
 * scripts/shared/report_style.py for generated reports.
 */
export default function DataCard({ entity }: { entity: WorkspaceEntity }) {
  const steps = entity.steps.length
  return (
    <a
      href={entityHash(entity.id)}
      className={`data-card entity-card${entity.pinned ? ' pinned' : ''}`}
      data-entity={entity.id}
    >
      <div className="card-top">
        <span className="chip">
          <span aria-hidden="true">{categoryIcon(entity.category)}</span>
          {entity.category || 'other'}
        </span>
        {entity.pinned && <span className="chip chip-pin">pinned</span>}
        <span className={`status-dot ${entity.status}`} title={entity.status} />
      </div>

      <div className="card-project-title">
        {entity.icon && <img className="card-project-icon" src={contentUrl(`/workspace/${entity.folder}/${entity.icon}`)} width="48" height="48" alt="" loading="lazy" decoding="async" />}
        <h3 className="card-title">{entity.title}</h3>
      </div>

      {entity.description && <p className="card-desc">{entity.description}</p>}

      <div className="card-foot">
        <span>
          {steps} step{steps === 1 ? '' : 's'}
        </span>
        <span>·</span>
        <span>{entity.updated ?? entity.created}</span>
        <span className="card-open" aria-hidden="true">
          open →
        </span>
      </div>
    </a>
  )
}
