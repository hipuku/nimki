import type { MDXComponents } from 'mdx/types'
import type { ComponentProps } from 'react'
import { CodeBlock } from './code-block'
import {
  ApiReference,
  Changelog,
  Demo,
  Install,
  KeyboardMap,
  MotionSpec,
  QualityBar,
  Status,
} from './component-page'
import { LiveCss, RoleGallery } from './motion-foundations'
import { LimitsTable, StaggerTable } from './motion-tables'

/** What MDX pages can use: plain elements, plus the page parts by name. */
export const mdxComponents: MDXComponents = {
  table: (props: ComponentProps<'table'>) => (
    <div className="table-wrap">
      <table {...props} />
    </div>
  ),
  pre: (props: ComponentProps<'pre'>) => <CodeBlock {...props} />,
  ApiReference,
  Changelog,
  Demo,
  Install,
  KeyboardMap,
  LimitsTable,
  LiveCss,
  MotionSpec,
  QualityBar,
  RoleGallery,
  StaggerTable,
  Status,
}
