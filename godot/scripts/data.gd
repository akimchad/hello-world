# Attack tables and roster stats ported from the web game (src/moves.js BASE/OVERRIDES, src/heroes.js HEROES).
# Times are seconds at attackSpeed 1; reach/heights are metres at scale 1, relative to the feet.
extends RefCounted

const BASE = {
	"jab": {
		"pose": [
			"jabW",
			"jab"
		],
		"startup": 0.07,
		"active": 0.06,
		"recovery": 0.14,
		"dmg": 4,
		"x0": 0.15,
		"x1": 0.95,
		"y0": 1.28,
		"y1": 1.75,
		"height": "high",
		"stun": 0.3,
		"blockstun": 0.16,
		"push": 1.6,
		"kind": "light",
		"sfx": "light",
		"next": "cross",
		"chainWindow": 0.22
	},
	"cross": {
		"pose": [
			"crossW",
			"cross"
		],
		"startup": 0.08,
		"active": 0.06,
		"recovery": 0.17,
		"dmg": 5,
		"x0": 0.15,
		"x1": 1.02,
		"y0": 1.25,
		"y1": 1.75,
		"height": "high",
		"stun": 0.32,
		"blockstun": 0.17,
		"push": 2,
		"kind": "light",
		"sfx": "light",
		"next": "kick",
		"chainWindow": 0.24
	},
	"kick": {
		"pose": [
			"kickW",
			"kick"
		],
		"startup": 0.11,
		"active": 0.08,
		"recovery": 0.25,
		"dmg": 7,
		"x0": 0.2,
		"x1": 1.28,
		"y0": 0.75,
		"y1": 1.5,
		"height": "mid",
		"stun": 0.42,
		"blockstun": 0.2,
		"push": 4.8,
		"kind": "medium",
		"sfx": "heavy"
	},
	"heavy": {
		"pose": [
			"hookW",
			"hook"
		],
		"startup": 0.2,
		"active": 0.08,
		"recovery": 0.32,
		"dmg": 11,
		"x0": 0.15,
		"x1": 1.15,
		"y0": 1.05,
		"y1": 1.75,
		"height": "mid",
		"stun": 0.5,
		"blockstun": 0.24,
		"push": 6.5,
		"kind": "heavy",
		"sfx": "heavy"
	},
	"sweep": {
		"pose": [
			"sweepW",
			"sweep"
		],
		"startup": 0.12,
		"active": 0.1,
		"recovery": 0.3,
		"dmg": 6,
		"x0": 0.2,
		"x1": 1.35,
		"y0": 0,
		"y1": 0.45,
		"height": "low",
		"stun": 0.4,
		"blockstun": 0.2,
		"push": 2.5,
		"knockdown": true,
		"kind": "medium",
		"sfx": "heavy",
		"crouch": true
	},
	"upper": {
		"pose": [
			"upperW",
			"upper"
		],
		"startup": 0.14,
		"active": 0.09,
		"recovery": 0.42,
		"dmg": 12,
		"x0": 0.1,
		"x1": 1,
		"y0": 0.6,
		"y1": 2.15,
		"height": "mid",
		"stun": 0.5,
		"blockstun": 0.26,
		"push": 2,
		"launch": 11.5,
		"kind": "heavy",
		"sfx": "heavy",
		"crouch": true
	},
	"airLight": {
		"pose": [
			"jump",
			"airKick"
		],
		"startup": 0.06,
		"active": 0.2,
		"recovery": 0.1,
		"dmg": 6,
		"x0": 0.1,
		"x1": 1.05,
		"y0": -0.1,
		"y1": 0.95,
		"height": "overhead",
		"stun": 0.38,
		"blockstun": 0.18,
		"push": 2.2,
		"kind": "light",
		"sfx": "light",
		"air": true
	},
	"airHeavy": {
		"pose": [
			"jump",
			"diveKick"
		],
		"startup": 0.1,
		"active": 0.22,
		"recovery": 0.12,
		"dmg": 9,
		"x0": 0.1,
		"x1": 1.15,
		"y0": -0.3,
		"y1": 0.85,
		"height": "overhead",
		"stun": 0.48,
		"blockstun": 0.22,
		"push": 3.2,
		"kind": "medium",
		"sfx": "heavy",
		"air": true
	}
}

const OVERRIDES = {
	"thor": {
		"heavy": {
			"pose": [
				"overheadW",
				"overhead"
			],
			"startup": 0.24,
			"dmg": 13,
			"x1": 1.45,
			"y0": 0.6,
			"height": "overhead",
			"color": 9425151,
			"sfx": "heavy",
			"zap": true,
			"lunge": 5,
			"shake": 0.5
		}
	},
	"hulk": {
		"jab": {
			"startup": 0.09,
			"dmg": 5.5,
			"x1": 1.1,
			"push": 2.6,
			"sfx": "heavy"
		},
		"cross": {
			"dmg": 6,
			"x1": 1.12,
			"push": 3
		},
		"heavy": {
			"pose": [
				"smashW",
				"smash"
			],
			"startup": 0.28,
			"recovery": 0.34,
			"dmg": 13,
			"x1": 1.3,
			"y0": 0.2,
			"height": "overhead",
			"armor": true,
			"knockdown": true,
			"push": 7,
			"shake": 0.6,
			"lunge": 4.5
		}
	},
	"gamora": {
		"jab": {
			"x1": 1.25,
			"sfx": "slash"
		},
		"cross": {
			"x1": 1.3,
			"sfx": "slash"
		},
		"heavy": {
			"pose": [
				"slashW",
				"slash"
			],
			"x1": 1.75,
			"dmg": 11,
			"sfx": "slash",
			"color": 9428223
		}
	},
	"cap": {
		"heavy": {
			"pose": [
				"shieldBashW",
				"shieldBash"
			],
			"startup": 0.24,
			"active": 0.1,
			"recovery": 0.3,
			"dmg": 12,
			"x0": 0.1,
			"x1": 1.2,
			"y0": 0.6,
			"y1": 1.85,
			"push": 8.5,
			"lunge": 5.5,
			"shake": 0.5,
			"sfx": "shield",
			"color": 12572415
		}
	},
	"ironman": {
		"heavy": {
			"color": 9429247
		}
	},
	"spiderman": {
		"jab": {
			"startup": 0.06,
			"webFlick": true
		},
		"kick": {
			"x1": 1.38
		},
		"heavy": {
			"pose": [
				"spinKickW",
				"spinKick"
			],
			"startup": 0.15,
			"active": 0.09,
			"recovery": 0.26,
			"dmg": 10,
			"x0": 0.1,
			"x1": 1.45,
			"y0": 0.8,
			"y1": 1.85,
			"push": 6.2
		}
	},
	"doom": {
		"heavy": {
			"color": 8257386,
			"zap": true,
			"dmg": 11.5
		}
	},
	"sentry": {
		"jab": {
			"dmg": 5,
			"color": 16765024
		},
		"cross": {
			"dmg": 5.5,
			"color": 16765024
		},
		"heavy": {
			"dmg": 12,
			"color": 16765024,
			"x1": 1.2,
			"push": 9,
			"knockdown": true,
			"shake": 0.5
		}
	},
	"groot": {
		"jab": {
			"startup": 0.1,
			"dmg": 5,
			"x1": 1.4,
			"stretch": 1.45,
			"sfx": "heavy",
			"color": 13148256
		},
		"cross": {
			"startup": 0.11,
			"dmg": 5.5,
			"x1": 1.45,
			"stretch": 1.5,
			"color": 13148256
		},
		"heavy": {
			"pose": [
				"hookW",
				"hook"
			],
			"startup": 0.26,
			"active": 0.1,
			"recovery": 0.38,
			"dmg": 12,
			"x0": 0,
			"x1": 2,
			"y0": 0.5,
			"y1": 2.1,
			"push": 8.5,
			"knockdown": true,
			"stretch": 1.9,
			"sfx": "heavy",
			"color": 13148256,
			"shake": 0.5
		}
	},
	"venom": {
		"jab": {
			"dmg": 5,
			"x1": 1.1,
			"sfx": "slash",
			"color": 10135807
		},
		"cross": {
			"dmg": 5.5,
			"x1": 1.12,
			"sfx": "slash",
			"color": 10135807
		},
		"heavy": {
			"startup": 0.21,
			"recovery": 0.34,
			"dmg": 13.5,
			"x1": 1.3,
			"push": 9,
			"knockdown": true,
			"shake": 0.55,
			"color": 6976767
		}
	},
	"deadpool": {
		"jab": {
			"startup": 0.05,
			"dmg": 3.6,
			"x1": 1.15,
			"sfx": "slash",
			"color": 14212351
		},
		"cross": {
			"startup": 0.06,
			"dmg": 4.4,
			"x1": 1.2,
			"sfx": "slash",
			"color": 14212351
		},
		"heavy": {
			"pose": [
				"spinKickW",
				"spinKick"
			],
			"startup": 0.12,
			"active": 0.1,
			"recovery": 0.2,
			"dmg": 9.5,
			"x0": 0.1,
			"x1": 1.4,
			"y0": 0.8,
			"y1": 1.85,
			"push": 5
		}
	}
}

const HEROES = [
	{
		"id": "spiderman",
		"name": "Spider-Man",
		"title": "Friendly Neighborhood Hero",
		"color": "#e2232b",
		"hp": 95,
		"speed": 4.7,
		"jump": 11.8,
		"airJumps": 1,
		"power": 0.95,
		"defense": 1,
		"attackSpeed": 0.9,
		"weight": 0.9,
		"stats": {
			"Power": 3,
			"Speed": 5,
			"Defense": 2,
			"Range": 3
		},
		"special": {
			"id": "webShot",
			"name": "Web Shot",
			"cd": 2.6,
			"desc": "Webbing that pins the foe in place, then slows them"
		},
		"ultimate": {
			"id": "webTakedown",
			"name": "Web-Slinging Takedown",
			"desc": "Swings around the foe on web lines, strikes from every side, then a web-assisted slam"
		},
		"passive": "Double jump"
	},
	{
		"id": "ironman",
		"name": "Iron Man",
		"title": "Armored Avenger",
		"color": "#d6a23a",
		"hp": 100,
		"speed": 3.9,
		"jump": 9.8,
		"airJumps": 0,
		"power": 1,
		"defense": 0.95,
		"attackSpeed": 1,
		"weight": 1.05,
		"stats": {
			"Power": 3,
			"Speed": 3,
			"Defense": 3,
			"Range": 5
		},
		"special": {
			"id": "missileBarrage",
			"name": "Micro-Missile Barrage",
			"cd": 3,
			"desc": "Twelve homing micro-missiles, then an overcharged Unibeam"
		},
		"ultimate": {
			"id": "nanoArsenal",
			"name": "Mark L Nanotech Arsenal",
			"desc": "Nanotech blades and shoulder pods form: a blade flurry, a homing missile and plasma swarm, then a point-blank plasma cannon blast"
		},
		"passive": "Hover (hold Jump while falling)"
	},
	{
		"id": "thor",
		"name": "Thor",
		"title": "God of Thunder",
		"color": "#5fb3ff",
		"hp": 110,
		"speed": 3.7,
		"jump": 9.8,
		"airJumps": 0,
		"power": 1.1,
		"defense": 0.95,
		"attackSpeed": 1.05,
		"weight": 1.15,
		"stats": {
			"Power": 4,
			"Speed": 3,
			"Defense": 3,
			"Range": 4
		},
		"special": {
			"id": "kineticSurge",
			"name": "Mjölnir Kinetic Surge",
			"cd": 3.4,
			"desc": "Hurls a lightning-wrapped Mjölnir through the foe, then calls it back, dragging them into a clothesline"
		},
		"ultimate": {
			"id": "bifrostJudgment",
			"name": "God of Thunder: Bifröst Judgment",
			"desc": "A Bifröst pillar lifts the foe for five lightning strikes, then a lightning dragon tears across the floor"
		},
		"passive": "Hammer heavy is an overhead"
	},
	{
		"id": "hulk",
		"name": "Hulk",
		"title": "The Strongest There Is",
		"color": "#4e8a2b",
		"hp": 130,
		"speed": 3.3,
		"jump": 10.2,
		"airJumps": 0,
		"power": 1.24,
		"defense": 0.86,
		"attackSpeed": 1.22,
		"weight": 1.6,
		"stats": {
			"Power": 5,
			"Speed": 2,
			"Defense": 5,
			"Range": 2
		},
		"special": {
			"id": "groundBreaker",
			"name": "Ground Breaker",
			"cd": 3.4,
			"desc": "Slams the floor: a local shockwave that staggers and slows (block low!)"
		},
		"ultimate": {
			"id": "worldBreaker",
			"name": "World-Breaker Thunderclap",
			"desc": "Roars, grabs the foe and slams them down, smashes them into the floor by the ankles, hurls them, then leaps after them for a Thunderclap"
		},
		"passive": "Armor: no flinch from light hits while attacking"
	},
	{
		"id": "cap",
		"name": "Captain America",
		"title": "The First Avenger",
		"color": "#3a6bd8",
		"hp": 105,
		"speed": 4.2,
		"jump": 10.2,
		"airJumps": 0,
		"power": 1,
		"defense": 1,
		"attackSpeed": 0.97,
		"weight": 1.05,
		"stats": {
			"Power": 3,
			"Speed": 4,
			"Defense": 4,
			"Range": 3
		},
		"special": {
			"id": "shieldThrow",
			"name": "Shield Throw",
			"cd": 2.4,
			"desc": "Ricocheting shield that returns"
		},
		"ultimate": {
			"id": "freedomStrike",
			"name": "Star-Spangled Blitz",
			"desc": "A bullet-dash shield rush, a street-fight string of ricochets, kicks and chops, then a crater-making shield slam"
		},
		"passive": "Shield block: takes almost no chip damage"
	},
	{
		"id": "gamora",
		"name": "Gamora",
		"title": "Deadliest Woman in the Galaxy",
		"color": "#3f8f62",
		"hp": 90,
		"speed": 4.9,
		"jump": 10.8,
		"airJumps": 0,
		"power": 1.05,
		"defense": 1.05,
		"attackSpeed": 0.82,
		"weight": 0.85,
		"stats": {
			"Power": 4,
			"Speed": 5,
			"Defense": 2,
			"Range": 4
		},
		"special": {
			"id": "dashSlash",
			"name": "Godslayer Dash",
			"cd": 2.6,
			"desc": "Lightning-fast dashing slash"
		},
		"ultimate": {
			"id": "bladeFury",
			"name": "Blade Fury",
			"desc": "Blinding multi-slash combo"
		},
		"passive": "Sword gives longer light attacks"
	},
	{
		"id": "doom",
		"name": "Doctor Doom",
		"title": "Monarch of Latveria",
		"color": "#3f7a3a",
		"hp": 115,
		"speed": 3.6,
		"jump": 9.6,
		"airJumps": 0,
		"power": 1.12,
		"defense": 0.92,
		"attackSpeed": 1,
		"weight": 1.15,
		"stats": {
			"Power": 4,
			"Speed": 3,
			"Defense": 4,
			"Range": 5
		},
		"special": {
			"id": "mysticBolts",
			"name": "Sorcerer's Wrath",
			"cd": 2.6,
			"desc": "Crimson-and-gold runes flare in the air and fire three emerald lances that leave the foe burning"
		},
		"ultimate": {
			"id": "monarchsWrath",
			"name": "Monarch's Wrath",
			"desc": "An arcane seal chains the foe, Doom siphons their power, then a beam ends in a pillar of emerald fire"
		},
		"passive": "Force field: blocking takes half chip damage"
	},
	{
		"id": "sentry",
		"name": "Sentry",
		"title": "Power of a Million Suns",
		"color": "#f0aa18",
		"hp": 105,
		"speed": 4.6,
		"jump": 11.2,
		"airJumps": 2,
		"power": 1.12,
		"defense": 0.95,
		"attackSpeed": 0.92,
		"weight": 1,
		"stats": {
			"Power": 5,
			"Speed": 4,
			"Defense": 3,
			"Range": 4
		},
		"special": {
			"id": "solarFlare",
			"name": "Golden Energy Blast",
			"cd": 2.6,
			"desc": "A concentrated burst of golden energy"
		},
		"ultimate": {
			"id": "voidErasure",
			"name": "The Void — Shadow Erasure",
			"desc": "Becomes the Void: the arena darkens and the foe is turned to shadow and erased, then returns"
		},
		"passive": "Flight: triple jump"
	},
	{
		"id": "groot",
		"name": "Groot",
		"title": "I Am Groot",
		"color": "#7a5a2e",
		"hp": 125,
		"speed": 3.4,
		"jump": 9.6,
		"airJumps": 0,
		"power": 1.05,
		"defense": 0.9,
		"attackSpeed": 1.1,
		"weight": 1.4,
		"regen": true,
		"stats": {
			"Power": 4,
			"Speed": 2,
			"Defense": 5,
			"Range": 5
		},
		"special": {
			"id": "rootSnare",
			"name": "Root Snare",
			"cd": 3.2,
			"desc": "Roots race along the floor and bind the foe in place"
		},
		"ultimate": {
			"id": "ancientForest",
			"name": "I Am Groot: Ancient Forest",
			"desc": "Grows to giant size, traps the foe in a forest of roots, then a root shockwave"
		},
		"passive": "Regrowth: heals back to half health out of combat; branch arms reach further"
	},
	{
		"id": "venom",
		"name": "Venom",
		"title": "Lethal Protector",
		"color": "#3a3f5c",
		"hp": 115,
		"speed": 4.3,
		"jump": 10.6,
		"airJumps": 0,
		"power": 1.12,
		"defense": 0.95,
		"attackSpeed": 0.95,
		"weight": 1.25,
		"stats": {
			"Power": 5,
			"Speed": 4,
			"Defense": 3,
			"Range": 4
		},
		"special": {
			"id": "symbioteLash",
			"name": "Symbiote Lash",
			"cd": 2.2,
			"desc": "A tendril lashes out at medium range"
		},
		"ultimate": {
			"id": "venomFeast",
			"name": "We Are Venom",
			"desc": "Tendrils seize the foe by the throat and slam them down, a vicious bite, then a symbiote greatsword driven straight down"
		},
		"passive": "Symbiote strength: heavier hits than Spider-Man"
	},
	{
		"id": "deadpool",
		"name": "Deadpool",
		"title": "Merc with a Mouth",
		"color": "#b3121c",
		"hp": 95,
		"speed": 4.8,
		"jump": 11,
		"airJumps": 0,
		"power": 0.98,
		"defense": 1.05,
		"attackSpeed": 0.8,
		"weight": 0.95,
		"regen": true,
		"stats": {
			"Power": 3,
			"Speed": 5,
			"Defense": 2,
			"Range": 4
		},
		"special": {
			"id": "teleportSlice",
			"name": "Katana Teleport Slice",
			"cd": 2.8,
			"desc": "Blinks behind the foe, two slashes, a grenade in their pocket and a backflip out"
		},
		"ultimate": {
			"id": "healthbarBeatdown",
			"name": "4th-Wall Beatdown",
			"desc": "Cracks the screen, steals the foe's health bar and clubs them with it, then a point-blank rocket and a selfie"
		},
		"passive": "Healing factor: heals back to half health out of combat"
	}
]

static func moves_for(hero_id: String) -> Dictionary:
	var out = {}
	var ov = OVERRIDES.get(hero_id, {})
	for k in BASE:
		var mv: Dictionary = BASE[k].duplicate(true)
		mv["name"] = k
		if ov.has(k): mv.merge(ov[k], true)
		out[k] = mv
	return out

static func hero(id: String) -> Dictionary:
	for h in HEROES:
		if h["id"] == id: return h
	return HEROES[0]
