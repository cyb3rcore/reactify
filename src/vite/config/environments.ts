function createClientEnvironment(dev: boolean, outDir: string) {
  return {
    build: {
      outDir: `${outDir}/client`,
      minify: !dev,
      sourcemap: dev,
      manifest: true,
    },
  }
}

function createSSREnvironment(isDev: boolean, outDir: string, clientModule: string) {
  return {
    build: {
      outDir: `${outDir}/server`,
      ssr: true,
      minify: !isDev,
      sourcemap: isDev,
      emitAssets: true,
      rollupOptions: {
        input: {
          index: clientModule,
        },
      },
    },
  }
}

export { createClientEnvironment, createSSREnvironment }
