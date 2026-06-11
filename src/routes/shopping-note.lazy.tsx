import { createLazyFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createLazyFileRoute('/shopping-note')({
  component: () => <Navigate to="/purchases/$documentType/new" params={{ documentType: 'gr' }} replace />,
})
