export namespace NamedError {
  export type Instance<
    Name extends string = string,
    Props extends Record<string, unknown> = Record<string, unknown>,
  > = Error & { name: Name } & Props

  export function create<const Name extends string, Props extends Record<string, unknown>>(name: Name, props: Props) {
    const error = Object.assign(new Error(String(props.message ?? name)), props, { name })
    return error as Instance<Name, Props>
  }

  export function is(err: unknown, name: string): err is Instance {
    return err instanceof Error && err.name === name
  }
}
