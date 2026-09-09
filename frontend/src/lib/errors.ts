/* Thrown when a valid sign-in is refused because the admin form was used by an
   account without the role. The credentials were correct; the door was wrong.
   It lives outside auth.tsx so that file keeps exporting components only. */
export class NotAnAdminError extends Error {}
