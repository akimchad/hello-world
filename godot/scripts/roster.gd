# Which model file belongs to which hero (mirrors assets/manifest.json), standing heights, and
# the MUA clips (Cap, Thor, Hulk) that play over the retargeted pose for those game keys.
extends RefCounted

const Data = preload("res://scripts/data.gd")
const ModelRig = preload("res://scripts/model_rig.gd")

const MODELS = {
	"spiderman": {"path": "res://models/spiderman/spiderman.glb", "height": 1.76},
	"ironman": {"path": "res://models/ironman/source/ironman.fbx", "height": 1.92, "textures": "res://models/ironman/textures/M-COC_iOS_HERO_Tony_Stark_Iron_Man_Mark_VII_Body_"},
	"thor": {"path": "res://models/thor/source/thor.fbx", "height": 1.95,
		"clips": {"idle": "idle", "block": "blocking", "punch": "attack_light1", "punch2": "attack_light2", "kick": "attack_light3", "heavy": "attack_heavy1", "uppercut": "attack_popup1", "sweep": "attack_trip1", "special": "power_2"}},
	"hulk": {"path": "res://models/hulk/hulk.glb", "height": 2.55,
		"clips": {"block": "blocking", "punch": "attack_light1", "punch2": "attack_light2", "kick": "attack_light3", "heavy": "attack_heavy1", "uppercut": "attack_popup1", "sweep": "attack_trip1"}},
	"cap": {"path": "res://models/cap/source/cap.fbx", "height": 1.88,
		"clips": {"idle": "idle", "block": "blocking", "punch": "attack_light1", "punch2": "attack_light2", "kick": "attack_light3", "uppercut": "attack_knockback1", "special": "power_1"}},
	"gamora": {"path": "res://models/gamora/gamora.fbx", "height": 1.78, "grip": "Melee_TwoHanded_Handle"},
	"doom": {"path": "res://models/doom/doom.fbx", "height": 1.96},
	"sentry": {"path": "res://models/sentry/sentry.fbx", "height": 1.92},
	"groot": {"path": "res://models/groot/groot.glb", "height": 2.5},
	"venom": {"path": "res://models/venom/venom.glb", "height": 2.2},
	"deadpool": {"path": "res://models/deadpool/deadpool.glb", "height": 1.84},
}

static func hero(id: String) -> Dictionary: return Data.hero(id)

# heroes whose model file is present, in roster order
static func available() -> Array:
	var out = []
	for h in Data.HEROES:
		var m = MODELS.get(h.id)
		if m != null and ResourceLoader.exists(m.path): out.append(h.id)
	return out

static func make_rig(id: String, alt := false) -> ModelRig:
	var m = MODELS[id]
	var r = ModelRig.new()
	r.name = id
	r.setup(id, m.path, m.height, m.get("clips", {}), m.get("grip", ""), alt)
	if m.has("textures"): _texture_static(r, m.textures)
	return r

# the Iron Man FBX references no textures: build its PBR material from the shipped maps
static func _texture_static(r: ModelRig, base: String):
	var mat = StandardMaterial3D.new()
	var tex = func(sfx): return load(base + sfx + ".png") if ResourceLoader.exists(base + sfx + ".png") else null
	mat.albedo_texture = tex.call("D")
	mat.normal_enabled = tex.call("N") != null
	mat.normal_texture = tex.call("N")
	var e = tex.call("E")
	if e != null: mat.emission_enabled = true; mat.emission_texture = e; mat.emission = Color.WHITE; mat.emission_energy_multiplier = 1.5
	mat.metallic = 0.75; mat.roughness = 0.35
	for mi in r.meshes:
		if mi.mesh == null: continue
		for s in mi.mesh.get_surface_count(): mi.set_surface_override_material(s, mat)
