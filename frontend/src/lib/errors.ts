/* Thrown when the credentials are valid but the wrong sign-in form was used.
   `door` is the one the account should have gone through. It lives outside
   auth.tsx so that file keeps exporting components only. */
export class WrongDoorError extends Error {
  readonly door: 'staff' | 'admin'

  constructor(door: 'staff' | 'admin') {
    super(`use the ${door} sign-in`)
    this.door = door
  }
}
