import { GitProcess } from 'dugite'

type ProcessOutput = {
  output: Buffer,
  error: Buffer,
}

export function spawnAndComplete(args: string[], path: string, name: string, successExitCodes?: Set<number>): Promise<ProcessOutput> {

  return new Promise<ProcessOutput>((resolve, reject) => {
    const commandName = `${name}: git ${args.join(' ')}`
    log.debug(`Executing ${commandName}`)

    const startTime = (performance && performance.now) ? performance.now() : null

    const process = GitProcess.spawn(args, path)
    process.stdout.setEncoding('binary')
    process.stderr.setEncoding('binary')

    const stdout = new Array<Buffer>()
    let output: Buffer | undefined
    process.stdout.on('data', (chunk) => {
      if (chunk instanceof Buffer) {
        stdout.push(chunk)
      } else {
        stdout.push(Buffer.from(chunk))
      }
    })

    const stderr = new Array<Buffer>()
    let error: Buffer | undefined
    process.stderr.on('data', (chunk) => {
      if (chunk instanceof Buffer) {
        stderr.push(chunk)
      } else {
        stderr.push(Buffer.from(chunk))
      }
    })

    function reportTimings() {
      if (startTime) {
        const rawTime = performance.now() - startTime
        if (rawTime > 1000) {
          const timeInSeconds = (rawTime / 1000).toFixed(3)
          log.info(`Executing ${commandName} (took ${timeInSeconds}s)`)
        }
      }
    }

    process.stdout.once('close', () => {
      // process.on('exit') may fire before stdout has closed, so this is a
      // more accurate point in time to measure that the command has completed
      // as we cannot proceed without the contents of the stdout stream
      reportTimings()

      output = Buffer.concat(stdout)
      if (output && error) {
        resolve({ output, error })
      }
    })

    process.stderr.once('closed', () => {
      error = Buffer.concat(stderr)

      if (output && error) {
        resolve({ output, error })
      }
    })

    process.on('error', err => {
      // for unhandled errors raised by the process, let's surface this in the
      // promise and make the caller handle it
      reject(err)
    })

    process.on('exit', (code, signal) => {
      // this mimics the experience of GitProcess.exec for handling known codes
      // when the process terminates
      const exitCodes = successExitCodes || new Set([ 0 ])
      if (!exitCodes.has(code)) {
        reject(new Error(`Git returned an unexpected exit code '${code}' which should be handled by the caller.'`))
      }
    })
  })
}
