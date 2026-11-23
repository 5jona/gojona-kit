export function createSampleSpec() {
  return {
    schemaVersion: 1,
    name: 'sample-ipc',
    description: 'Sample cross-language IPC contract.',
    constants: {
      protocol: {
        doc: 'Protocol constants.',
        rustMod: 'protocol',
        kotlinObject: 'ProtocolConstants',
        tsName: 'PROTOCOL_CONSTANTS',
        items: {
          VERSION: { value: 1, type: 'u16', doc: 'Wire schema version.' },
          CHANNEL_NAME: { value: 'pochita.ipc', type: 'string' },
          DEFAULT_RATIO: { value: 1, type: 'f64' },
          ENABLED_BY_DEFAULT: { value: true, type: 'bool' },
        },
      },
    },
    enums: {
      SurfaceKind: {
        doc: 'Container backdrop surface mode.',
        renameAll: 'kebab-case',
        variants: [
          { name: 'NativeGlass', doc: 'Hardware blurred backdrop.' },
          { name: 'Standalone' },
          { name: 'CustomOpaque', wire: 'opaque_v1' },
        ],
      },
    },
    structs: {
      NodeConfig: {
        doc: 'Service endpoint configuration.',
        renameAll: 'camelCase',
        fields: [
          { name: 'node_id', type: 'string', doc: 'Unique node identifier.' },
          { name: 'port', type: 'u16', default: 8080 },
          { name: 'type', type: 'string', wire: 'node-type' },
          { name: 'surface', type: { ref: 'SurfaceKind' } },
          { name: 'tags', type: { list: 'string' }, optional: true, skipSerializingIfNone: true },
          { name: 'metadata', type: { map: ['string', 'json'] }, optional: true },
        ],
      },
      PingResult: {
        renameAll: 'camelCase',
        fields: [
          { name: 'ok', type: 'bool' },
          { name: 'uptime_ms', type: 'u64' },
        ],
      },
    },
    taggedUnions: {
      HostCommand: {
        doc: 'Tagged container command envelope.',
        tag: 'kind',
        renameAll: 'camelCase',
        variants: [
          { name: 'Dismiss', doc: 'Close container.' },
          {
            name: 'Resize',
            fields: [
              { name: 'width_dp', type: 'u32' },
              { name: 'height_dp', type: 'u32' },
            ],
          },
          { name: 'ApplyNode', payload: { ref: 'NodeConfig' } },
        ],
      },
      AdjacentEvent: {
        tag: 'type',
        content: 'payload',
        renameAll: 'snake_case',
        variants: [{ name: 'Heartbeat', payload: 'u64' }, { name: 'Reset' }],
      },
    },
    rpcs: {
      PING: {
        method: 'core.ping',
        params: null,
        result: { ref: 'PingResult' },
        doc: 'Health check.',
      },
      UPDATE_NODE: { method: 'node.update', params: { ref: 'NodeConfig' }, result: null },
    },
    events: {
      STATE_CHANGED: { event: 'core.stateChanged', payload: { ref: 'NodeConfig' } },
      READY: { event: 'core.ready', payload: null },
    },
    outputs: [
      { target: 'rust', path: 'out/contracts.rs', header: 'Sample Rust contract' },
      {
        target: 'rust',
        path: 'out/constants_only.rs',
        include: { constants: ['protocol'], rpcs: true },
      },
      { target: 'kotlin', path: 'out/Contracts.kt', package: 'com.example.contracts' },
      { target: 'ts', path: 'out/contracts.ts' },
      { target: 'jsonSchema', path: 'out/contracts.schema.json', title: 'Sample IPC Schema' },
    ],
  };
}
