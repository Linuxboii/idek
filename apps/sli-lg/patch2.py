with open('client/src/pages/LandingPage.jsx', 'r', encoding='utf-8') as f:
    text = f.read()

replacements = [
    (
        "    title: 'Mokila Grand Enclave',",
        "    title: 'Premium Apartments',"
    ),
    (
        "    location: 'Mokila, West Hyderabad',",
        "    location: 'Hyderabad',"
    ),
    (
        "    size: '267 to 600 sq. yd.',",
        "    size: 'Various sizes',"
    ),
    (
        "    status: 'Phase 2 open',",
        "    status: 'Available',"
    ),
    (
        "    image:\n      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',",
        "    image:\n      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    image:\r\n      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',",
        "    image:\r\n      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    imageAlt: 'Aerial view of a premium plotted residential community with wide internal roads',",
        "    imageAlt: 'Interior of a premium modern apartment block',"
    ),
    (
        "    description: 'Villa-focused plotted community with ORR access.',",
        "    description: 'Explore our curated list of premium apartments across Hyderabad.',"
    ),
    (
        "    tags: ['Villa-facing plots', '30 ft. and 40 ft. roads', 'High-growth micro market'],",
        "    tags: ['Luxury', 'City Center', 'Modern amenities'],"
    ),
    (
        "    title: 'Shadnagar Aero County',",
        "    title: 'Premium Villas',"
    ),
    (
        "    location: 'Shadnagar growth belt',",
        "    location: 'Hyderabad',"
    ),
    (
        "    size: '200 to 500 sq. yd.',",
        "    size: 'Spacious layouts',"
    ),
    (
        "    status: 'Launching inventory',",
        "    status: 'Available',"
    ),
    (
        "    image:\n      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',",
        "    image:\n      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    image:\r\n      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',",
        "    image:\r\n      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    imageAlt: 'Modern township planning zone near an emerging logistics and airport corridor',",
        "    imageAlt: 'Exterior view of a luxury premium villa',"
    ),
    (
        "    description: 'Value-focused plots near growth corridors.',",
        "    description: 'Spacious and luxurious villas for those who demand the best.',"
    ),
    (
        "    tags: ['Entry pricing', 'Future appreciation', 'Investor-friendly inventory'],",
        "    tags: ['Independent', 'Gated community', 'Premium lifestyle'],"
    ),
    (
        "    title: 'Yadagirigutta Temple View Plots',",
        "    title: 'Office Space',"
    ),
    (
        "    location: 'Yadagirigutta corridor',",
        "    location: 'Hyderabad',"
    ),
    (
        "    size: '180 to 400 sq. yd.',",
        "    size: 'Flexible sizes',"
    ),
    (
        "    status: 'Limited corner plots',",
        "    status: 'Available',"
    ),
    (
        "    image:\n      'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1400&q=80',",
        "    image:\n      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    image:\r\n      'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1400&q=80',",
        "    image:\r\n      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',"
    ),
    (
        "    imageAlt: 'Scenic plotted development zone near destination corridor growth infrastructure',",
        "    imageAlt: 'Modern open plan office space',"
    ),
    (
        "    description: 'Long-hold option in an emerging corridor.',",
        "    description: 'Find the ideal office space tailored to meet your unique business goals.',"
    ),
    (
        "    tags: ['Destination corridor', 'Corner plots', 'Weekend-home potential'],",
        "    tags: ['Commercial', 'IT corridors', 'Business hubs'],"
    )
]

for old, new in replacements:
    if old in text:
        text = text.replace(old, new)
        print(f'Replaced: {old[:20]}')
    else:
        print(f'Failed: {old[:20]}')

with open('client/src/pages/LandingPage.jsx', 'w', encoding='utf-8') as f:
    f.write(text)
