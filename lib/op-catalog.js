export const OP_CATALOG = [
  { op: "project.new", args: { format: "free | bedrock | bedrock_block | java_block | ..." }, use: "Start a clean project before building. Clears the texture list too, so re-create textures afterwards.", avoid: "Do not call it between edits that you want to keep." },
  { op: "project.set", args: { format: "string", name: "string?" }, use: "Change the project format or name without clearing geometry.", avoid: "Switching format may invalidate existing UVs; verify the viewport." },
  { op: "state.get", args: {}, use: "Read project summary, cubes, groups, textures, animations.", avoid: "Cheap, but prefer mc_live_state when you only need the summary." },
  { op: "cube.add", args: { from: "[x,y,z]", to: "[x,y,z]", name: "string?", group: "string?" }, use: "Add one cuboid. Batch 10-15 per mc_live_do call; larger batches time out client side.", avoid: "Do not exceed ~50 per batch." },
  { op: "cube.set", args: { uuid: "string?", name: "string?", from: "[x,y,z]?", to: "[x,y,z]?", rotation: "[x,y,z]?", origin: "[x,y,z]?", inflate: "number?" }, use: "Move, resize or rotate an existing cube; target by uuid or name.", avoid: "Rotation needs origin set, otherwise it pivots around the world origin." },
  { op: "cube.remove", args: { uuid: "string?", name: "string?" }, use: "Delete one cube by uuid or name.", avoid: "Irreversible except through mc_live_txn undo." },
  { op: "group.add", args: { name: "string", origin: "[x,y,z]?" }, use: "Create a bone/group so parts can rotate together.", avoid: "A single root group prevents skeletal animation; keep chains shallow." },
  { op: "group.assign", args: { cube: "string", group: "string" }, use: "Reparent a cube into a group.", avoid: "Renaming a bone later breaks animation keyframes." },
  { op: "texture.new", args: { name: "string", width: "number", height: "number" }, use: "Create an empty texture canvas.", avoid: "It does not paint anything; pair with texture.paint or bind an existing PNG." },
  { op: "texture.paint", args: { name: "string", rect: "[x,y,w,h]", color: "#RRGGBBAA" }, use: "Fill a rectangle of a texture.", avoid: "Per-pixel art is faster authored offline and embedded as a PNG." },
  { op: "uv.map", args: { cube: "string", face: "string", uv: "[u1,v1,u2,v2]" }, use: "Set one face UV in the project resolution space (usually 0..resolution).", avoid: "UV space is the project resolution, not the PNG size; a 128px atlas gives 2 logical units per 16px tile." },
  { op: "anim.keyframe", args: { animation: "string", channel: "string", time: "number", value: "any" }, use: "Add a keyframe to an existing animation.", avoid: "Block-format models cannot animate geometry at all." },
  { op: "see", args: { width: "number?", height: "number?", angle: "string?", allow_blank: "boolean?" }, use: "Render a frame. Same as calling mc_live_see with see=true in a batch.", avoid: "Not needed inside a batch that already sets see=true." },
  { op: "undo", args: {}, use: "Undo the last transaction.", avoid: "Prefer mc_live_txn for explicit control, and batch txn=rollback for whole-batch revert." },
  { op: "redo", args: {}, use: "Redo the last undone transaction.", avoid: "Redo stack is cleared by the next edit." }
];

export const OP_CATALOG_NOTE = "Local catalog: no round trip. Pass live=true to ask the running Blockbench for its own op list instead.";