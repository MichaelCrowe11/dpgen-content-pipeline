#!/usr/bin/env python3
"""
Simple Firestore seeding script that uses gcloud auth for authentication.
"""

import json
from google.cloud import firestore

# Initialize Firestore client (uses gcloud auth)
db = firestore.Client(project="deep-parallel-content")

# Channel configurations
CHANNELS = [
    {
        "slug": "circuit-myth",
        "name": "Circuit Myth",
        "description": "Tech myths & benchmarks demystified",
        "target_duration": 90,
        "voice_style": "professional",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "CPU benchmarks", "GPU comparisons", "SSD myths", "RAM speed tests",
            "Overclocking truths", "Thermal throttling", "Power consumption",
            "Gaming performance", "Productivity benchmarks"
        ]
    },
    {
        "slug": "deeptime-microhistory", 
        "name": "DeepTime Microhistory",
        "description": "60-120s history shorts that zoom into pivotal moments",
        "target_duration": 75,
        "voice_style": "narrative",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Ancient discoveries", "Medieval innovations", "Renaissance breakthroughs",
            "Industrial milestones", "Scientific revelations", "Cultural shifts",
            "Political moments", "Economic turning points"
        ]
    },
    {
        "slug": "zero-view-science",
        "name": "Zero-View Science", 
        "description": "Everyday physics demos and explanations",
        "target_duration": 60,
        "voice_style": "enthusiastic",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Kitchen physics", "Weather phenomena", "Light experiments",
            "Sound demonstrations", "Chemistry reactions", "Biology facts",
            "Space science", "Energy examples", "Motion principles"
        ]
    },
    {
        "slug": "map-oddities",
        "name": "Map Oddities",
        "description": "Geographic quirks and cartographic curiosities", 
        "target_duration": 85,
        "voice_style": "curious",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Border anomalies", "Island mysteries", "City planning quirks",
            "Natural boundaries", "Historical borders", "Geographic extremes",
            "Climate zones", "Population distributions", "Transportation networks"
        ]
    },
    {
        "slug": "space-minute",
        "name": "Space Minute",
        "description": "Quick space explainers and astronomy facts",
        "target_duration": 60,
        "voice_style": "educational",
        "posting_schedule": ["12:30", "19:30"], 
        "content_topics": [
            "Planet facts", "Star formation", "Galaxy types", "Black holes",
            "Space missions", "Asteroid belts", "Cosmic phenomena",
            "Telescope discoveries", "Space technology", "Exoplanets"
        ]
    },
    {
        "slug": "design-details",
        "name": "Design Details",
        "description": "Industrial design insights and product stories",
        "target_duration": 90,
        "voice_style": "analytical",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Product evolution", "Material choices", "Form vs function",
            "User experience", "Manufacturing processes", "Design principles",
            "Ergonomics", "Aesthetic decisions", "Innovation stories"
        ]
    },
    {
        "slug": "pattern-language",
        "name": "Pattern Language", 
        "description": "Productivity patterns and AI workflow optimization",
        "target_duration": 75,
        "voice_style": "instructional",
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Workflow optimization", "AI tool integration", "Automation patterns",
            "Productivity systems", "Time management", "Task organization",
            "Knowledge management", "Decision frameworks", "Habit formation"
        ]
    },
    {
        "slug": "econ-snack",
        "name": "Econ Snack",
        "description": "Economic literacy in bite-sized explanations",
        "target_duration": 70,
        "voice_style": "explanatory", 
        "posting_schedule": ["12:30", "19:30"],
        "content_topics": [
            "Market mechanisms", "Supply and demand", "Economic indicators",
            "Monetary policy", "Trade principles", "Investment basics",
            "Business models", "Economic history", "Financial concepts"
        ]
    }
]

def seed_channels():
    """Seed channel configurations into Firestore."""
    print("Starting Firestore seeding...")
    
    batch = db.batch()
    
    for channel in CHANNELS:
        # Add default fields
        channel.update({
            "created_at": firestore.SERVER_TIMESTAMP,
            "updated_at": firestore.SERVER_TIMESTAMP,
            "active": True,
            "daily_quota": 2,
            "current_quota_used": 0,
            "total_videos_created": 0,
            "bucket_name": f"deepparallel-{channel['slug'].replace('-', '')}",
            "aspect_ratio": "9:16",
            "resolution": "1080p"
        })
        
        # Reference to channel document
        channel_ref = db.collection("channels").document(channel["slug"])
        batch.set(channel_ref, channel)
        print(f"✓ Prepared {channel['name']} ({channel['slug']})")
    
    # Commit batch write
    batch.commit()
    print("✅ All channels seeded successfully!")
    
    # Verify seeding
    channels = list(db.collection("channels").stream())
    print(f"📊 Total channels in database: {len(channels)}")
    
    return len(channels)

if __name__ == "__main__":
    try:
        count = seed_channels()
        print(f"\n🎉 Seeding complete! {count} channels configured.")
    except Exception as e:
        print(f"❌ Seeding failed: {e}")
        raise