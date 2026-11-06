# Tower Rooftop: midnight over a neon skyline, searchlights sweeping the clouds (the web game's
# first stage, rebuilt from primitives). The fight plane is z = 0; the walls are at +-bounds.
extends Node3D

var bounds := 10.5
var env: Environment
var key: DirectionalLight3D
var searchlights := []
var base_energy := 1.0
var dark := 0.0
var signs := []

func build(_id: String):
	var we = WorldEnvironment.new()
	env = Environment.new()
	var sky = Sky.new()
	var sm = ProceduralSkyMaterial.new()
	sm.sky_top_color = Color(0.02, 0.03, 0.09)
	sm.sky_horizon_color = Color(0.2, 0.12, 0.28)
	sm.ground_bottom_color = Color(0.01, 0.01, 0.02)
	sm.ground_horizon_color = Color(0.2, 0.12, 0.28)
	sm.sun_angle_max = 0.0
	sky.sky_material = sm
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 1.4
	env.tonemap_mode = Environment.TONE_MAPPER_ACES
	env.tonemap_exposure = 1.1
	env.glow_enabled = true
	env.glow_intensity = 0.7
	env.glow_bloom = 0.02
	env.glow_hdr_threshold = 1.3
	env.fog_enabled = true
	env.fog_light_color = Color(0.12, 0.1, 0.2)
	env.fog_density = 0.004
	env.ssao_enabled = true
	we.environment = env
	add_child(we)
	key = DirectionalLight3D.new()
	key.light_color = Color(0.75, 0.82, 1.0)
	key.light_energy = 1.6
	key.rotation_degrees = Vector3(-48, 28, 0)
	key.shadow_enabled = true
	key.directional_shadow_max_distance = 40
	add_child(key)
	var fill = DirectionalLight3D.new()
	fill.light_color = Color(1.0, 0.45, 0.75); fill.light_energy = 0.55; fill.rotation_degrees = Vector3(-15, 200, 0)
	add_child(fill)
	base_energy = key.light_energy
	_roof()
	_skyline()
	_searchlights()

func _mat(c: Color, rough := 0.85, metal := 0.0) -> StandardMaterial3D:
	var m = StandardMaterial3D.new(); m.albedo_color = c; m.roughness = rough; m.metallic = metal
	return m

func _box(size: Vector3, pos: Vector3, m: Material, shadow := true) -> MeshInstance3D:
	var mi = MeshInstance3D.new(); var b = BoxMesh.new(); b.size = size; mi.mesh = b
	mi.material_override = m; mi.position = pos
	mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_ON if shadow else GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mi)
	return mi

func _roof():
	# concrete deck with a tiled texture made from noise
	var noise = FastNoiseLite.new(); noise.frequency = 0.03
	var nt = NoiseTexture2D.new(); nt.noise = noise; nt.width = 256; nt.height = 256; nt.seamless = true
	var ramp = Gradient.new(); ramp.set_color(0, Color(0.75, 0.75, 0.78)); ramp.set_color(1, Color(1, 1, 1)); nt.color_ramp = ramp
	var deck = _mat(Color(0.3, 0.3, 0.33), 0.85)
	deck.albedo_texture = nt
	deck.uv1_triplanar = true
	deck.uv1_world_triplanar = true
	deck.uv1_scale = Vector3(0.25, 0.25, 0.25)
	_box(Vector3(30, 0.4, 9), Vector3(0, -0.2, 0), deck)
	# a painted helipad ring behind the fighters
	var ring = MeshInstance3D.new(); var tm = TorusMesh.new(); tm.inner_radius = 2.6; tm.outer_radius = 2.8; tm.rings = 48
	ring.mesh = tm; ring.scale = Vector3(1, 0.01, 0.5); ring.position = Vector3(0, 0.005, -1.8)
	ring.material_override = _mat(Color(0.85, 0.75, 0.25), 0.7); add_child(ring)
	# parapet walls, railing and rooftop clutter behind the fight line
	var wall = _mat(Color(0.22, 0.22, 0.26), 0.9)
	_box(Vector3(30, 0.9, 0.3), Vector3(0, 0.45, -4.4), wall)
	for sx in [-1, 1]:
		_box(Vector3(0.4, 1.4, 9), Vector3(sx * 12.6, 0.7, 0), wall)
		_box(Vector3(2.2, 2.2, 2.0), Vector3(sx * 8.5, 1.1, -3.2), _mat(Color(0.3, 0.32, 0.36), 0.6, 0.4))  # AC units
	var rail = _mat(Color(0.5, 0.52, 0.56), 0.4, 0.8)
	_box(Vector3(30, 0.06, 0.06), Vector3(0, 1.4, -4.4), rail)
	for i in 16: _box(Vector3(0.05, 0.5, 0.05), Vector3(-14 + i * 1.87, 1.15, -4.4), rail)
	# water tower
	var wt = MeshInstance3D.new(); var cm = CylinderMesh.new(); cm.top_radius = 1.3; cm.bottom_radius = 1.3; cm.height = 2.4
	wt.mesh = cm; wt.position = Vector3(-6, 4.4, -6.2); wt.material_override = _mat(Color(0.35, 0.25, 0.18), 0.9); add_child(wt)
	for lx in [-0.9, 0.9]: _box(Vector3(0.12, 3.2, 0.12), Vector3(-6 + lx, 1.6, -6.2), rail)
	# neon sign on the next tower
	var neon = StandardMaterial3D.new(); neon.emission_enabled = true; neon.emission = Color(1.0, 0.2, 0.55); neon.emission_energy_multiplier = 4.0; neon.albedo_color = Color(0.3, 0.05, 0.15)
	signs.append(_box(Vector3(6, 0.25, 0.1), Vector3(5, 5.2, -7), neon, false))
	signs.append(_box(Vector3(0.25, 2.0, 0.1), Vector3(2.1, 4.3, -7), neon, false))
	var neon2 = neon.duplicate(); neon2.emission = Color(0.2, 0.8, 1.0)
	signs.append(_box(Vector3(4, 0.2, 0.1), Vector3(5, 4.4, -7), neon2, false))

func _skyline():
	var rng = RandomNumberGenerator.new(); rng.seed = 7
	var body = _mat(Color(0.035, 0.035, 0.06), 0.8)
	var lit := []   # window transforms and colours
	for row in 3:
		var z = -22.0 - row * 16.0
		var x = -80.0
		while x < 80.0:
			var w = rng.randf_range(5, 10)
			var h = rng.randf_range(10, 30) + row * 12
			var d = w * 0.8
			var bz = z + rng.randf_range(-3, 3)
			_box(Vector3(w, h, d), Vector3(x + w / 2, h / 2 - 12, bz), body, false)
			# lit windows on the face toward the fight
			var cols = int(w / 1.3); var rows = int(h / 1.7)
			for cy in rows:
				for cx in cols:
					if rng.randf() < 0.32:
						var px = x + (cx + 0.5) * (w / cols)
						var py = -12 + (cy + 0.5) * (h / rows)
						var c = Color(1.0, 0.78, 0.45) if rng.randf() < 0.75 else Color(0.55, 0.8, 1.0)
						lit.append([Vector3(px, py, bz + d / 2 + 0.03), c * rng.randf_range(0.35, 0.9)])
			x += w + rng.randf_range(1, 4)
	var mm = MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	var q = QuadMesh.new(); q.size = Vector2(0.55, 0.8)
	mm.mesh = q
	mm.instance_count = lit.size()
	for i in lit.size():
		mm.set_instance_transform(i, Transform3D(Basis(), lit[i][0]))
		mm.set_instance_color(i, lit[i][1])
	var mmi = MultiMeshInstance3D.new(); mmi.multimesh = mm
	var wm = StandardMaterial3D.new(); wm.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; wm.vertex_color_use_as_albedo = true
	mmi.material_override = wm
	mmi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mmi)

func _searchlights():
	for i in 3:
		var beam = MeshInstance3D.new(); var cm = CylinderMesh.new(); cm.top_radius = 2.5; cm.bottom_radius = 0.2; cm.height = 60
		beam.mesh = cm
		var m = StandardMaterial3D.new(); m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		m.blend_mode = BaseMaterial3D.BLEND_MODE_ADD; m.albedo_color = Color(0.5, 0.6, 0.9, 0.06); m.cull_mode = BaseMaterial3D.CULL_DISABLED
		beam.material_override = m
		beam.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
		var pivot = Node3D.new(); pivot.position = Vector3(-30 + i * 30, -10, -40)
		add_child(pivot); pivot.add_child(beam); beam.position.y = 30
		searchlights.append(pivot)

func step(_dt: float, t: float):
	for i in searchlights.size():
		searchlights[i].rotation = Vector3(0, 0, sin(t * 0.25 + i * 2.1) * 0.6)
	var flick = 1.0 if fmod(t * 1.3, 7.0) > 0.12 else 0.2
	for s in signs: s.material_override.emission_energy_multiplier = 4.0 * flick * (1.0 - dark * 0.7)

func set_dark(level: float, dt: float):
	dark += (level - dark) * min(1.0, dt * (5.0 if level > 0 else 3.0))
	key.light_energy = base_energy * (1.0 - 0.7 * dark)
	env.ambient_light_energy = 1.4 * (1.0 - 0.75 * dark)
	env.tonemap_exposure = 1.1 * (1.0 - 0.45 * dark)

func follow(_mid_x: float): pass
