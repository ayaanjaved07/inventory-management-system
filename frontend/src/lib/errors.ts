/* Thrown when the password is right but the user picked the wrong login tab
   (staff vs admin). `tab` is the tab they should have used. */
export class WrongLoginTabError extends Error {
  readonly tab: 'staff' | 'admin'

  constructor(tab: 'staff' | 'admin') {
    super(`use the ${tab} sign-in`)
    this.tab = tab
  }
}
