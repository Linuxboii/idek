import sys

with open('client/src/pages/LandingPage.jsx', 'r', encoding='utf-8') as f:
    content = f.read()

replacements = [
    (
        \"const benefits = ['DTCP Approved', 'Build Ready', 'IT Corridors']\",
        \"const benefits = ['Buying', 'Renting', 'Selling']\"
    ),
    (
        \"\"\"const highlights = [
  { value: 'DTCP', label: 'Approved layouts' },
  { value: '12%', label: 'Growth focus' },
  { value: '24/7', label: 'Call and WhatsApp' },
]\"\"\",
        \"\"\"const highlights = [
  { value: '20+', label: 'Years of Experience' },
  { value: '100%', label: 'Client Satisfaction' },
  { value: 'End-to-End', label: 'Solutions' },
]\"\"\"
    ),
    (
        \"{ label: 'Projects', href: '#projects' },\",
        \"{ label: 'Properties', href: '#properties' },\"
    ),
    (
        \"{ label: 'Features', href: '#features' },\",
        \"{ label: 'About', href: '#features' },\"
    ),
    (
        \"\"\"const featureCards = [
  {
    title: 'Verified plot intelligence',
    description: 'Clear documents and location context.',
  },
  {
    title: 'Fast buyer response',
    description: 'Quick updates for serious buyers.',
  },
  {
    title: 'Live dashboard access',
    description: 'View synced lead and chat data.',
  },
  {
    title: 'Guided shortlist planning',
    description: 'Compare options before a site visit.',
  },
]\"\"\",
        \"\"\"const featureCards = [
  {
    title: 'Buying & Selling',
    description: 'We help you find the ideal office space or property to buy or sell.',
  },
  {
    title: 'Real estate advisory',
    description: 'Expert advice on your real estate investments and property planning.',
  },
  {
    title: 'Leasing management',
    description: 'Comprehensive leasing and rental solutions tailored for you.',
  },
  {
    title: 'Legal compliance',
    description: 'Guiding you through all necessary legal obligations securely.',
  },
]\"\"\"
    ),
    (
        \"\"\"const whySpaceReasons = [
  {
    title: 'Legal confidence first',
    stat: 'Document-first review',
    detail: 'Check approvals before you visit.',
  },
  {
    title: 'Faster buyer coordination',
    stat: '90-minute response window',
    detail: 'Get pricing and visit help faster.',
  },
  {
    title: 'Growth corridor focus',
    stat: '3 focus markets',
    detail: 'Projects centered on high-growth corridors.',
  },
]\"\"\",
        \"\"\"const whySpaceReasons = [
  {
    title: 'Honesty and Integrity',
    stat: 'Transparent Real Estate',
    detail: 'We are working to transform this industry through honesty, integrity, and exceptional service.',
  },
  {
    title: 'Expert Leadership',
    stat: '20+ years expertise',
    detail: 'Led by Mr. Karuna Kumar Vakalapudi with decades of competence in construction and finance.',
  },
  {
    title: 'Comprehensive Solutions',
    stat: 'End-to-End service',
    detail: 'Specialised end-to-end solutions for all your property, leasing, and investment needs.',
  },
]\"\"\"
    ),
    (
        \"\"\"const projects = [
  {
    title: 'Mokila Grand Enclave',
    location: 'Mokila, West Hyderabad',
    size: '267 to 600 sq. yd.',
    status: 'Phase 2 open',
    image:
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Aerial view of a premium plotted residential community with wide internal roads',
    description: 'Villa-focused plotted community with ORR access.',
    tags: ['Villa-facing plots', '30 ft. and 40 ft. roads', 'High-growth micro market'],
  },
  {
    title: 'Shadnagar Aero County',
    location: 'Shadnagar growth belt',
    size: '200 to 500 sq. yd.',
    status: 'Launching inventory',
    image:
      'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Modern township planning zone near an emerging logistics and airport corridor',
    description: 'Value-focused plots near growth corridors.',
    tags: ['Entry pricing', 'Future appreciation', 'Investor-friendly inventory'],
  },
  {
    title: 'Yadagirigutta Temple View Plots',
    location: 'Yadagirigutta corridor',
    size: '180 to 400 sq. yd.',
    status: 'Limited corner plots',
    image:
      'https://images.unsplash.com/photo-1460317442991-0ec209397118?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Scenic plotted development zone near destination corridor growth infrastructure',
    description: 'Long-hold option in an emerging corridor.',
    tags: ['Destination corridor', 'Corner plots', 'Weekend-home potential'],
  },
]\"\"\",
        \"\"\"const projects = [
  {
    title: 'Premium Apartments',
    location: 'Hyderabad',
    size: 'Various sizes',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1522708323590-d24dbb6b0267?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Interior of a premium modern apartment block',
    description: 'Explore our curated list of premium apartments across Hyderabad.',
    tags: ['Luxury', 'City Center', 'Modern amenities'],
  },
  {
    title: 'Premium Villas',
    location: 'Hyderabad',
    size: 'Spacious layouts',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Exterior view of a luxury premium villa',
    description: 'Spacious and luxurious villas for those who demand the best.',
    tags: ['Independent', 'Gated community', 'Premium lifestyle'],
  },
  {
    title: 'Office Space',
    location: 'Hyderabad',
    size: 'Flexible sizes',
    status: 'Available',
    image:
      'https://images.unsplash.com/photo-1497366216548-37526070297c?auto=format&fit=crop&w=1400&q=80',
    imageAlt: 'Modern open plan office space',
    description: 'Find the ideal office space tailored to meet your unique business goals.',
    tags: ['Commercial', 'IT corridors', 'Business hubs'],
  },
]\"\"\"
    ),
    (
        \"\"\"const testimonials = [
  {
    name: 'Praveen R.',
    role: 'IT professional, Gachibowli',
    quote: 'Clear shortlist and faster visits.',
  },
  {
    name: 'Sowmya and Kiran',
    role: 'First-time plot buyers',
    quote: 'Clear guidance without pressure.',
  },
  {
    name: 'Ramanathan V.',
    role: 'Investor, Bengaluru',
    quote: 'Fast updates and smooth coordination.',
  },
]\"\"\",
        \"\"\"const testimonials = [
  {
    name: 'Rama Krishna',
    role: 'Client',
    quote: 'Kumar delivered us the apartment with a great rental value in a good price. Thorough professional.',
  },
  {
    name: 'Jagadiesh A',
    role: 'Client',
    quote: 'Impressed with their transparency, service, and professionalism. ALWAYS available for home tours.',
  },
  {
    name: 'Satish Kumar',
    role: 'Client',
    quote: 'The best realtor we’ve ever worked with. Gets the work done seamlessly without stepping out of the house.',
  },
]\"\"\"
    ),
    (\"Hyderabad plots\", \"Hyderabad Real Estate\"),
    (\"Premium open plots.\", \"Comprehensive real estate solutions.\"),
    (\"DTCP-approved plotted developments in key Hyderabad corridors.\", \"Space Link provides specialised services including buying, renting, and selling properties all around Hyderabad.\"),
    (\"Our Projects\", \"Property Types\"),
    (\"Current projects.\", \"Available property types.\"),
    ('id=\"projects\"', 'id=\"properties\"'),
    (\"href=\\\"#projects\\\"\", \"href=\\\"#properties\\\"\"),
    (\"Larger plot showcase.\", \"Premium properties showcase.\"),
    (\"signatureShowcaseImages\", \"signatureShowcaseImages\"),
    (\"Villa plots\", \"Apartments\"),
    (\"Investor inventory\", \"Villas\"),
    (\"Destination corridors\", \"Commercial\"),
]

for old, new in replacements:
    if '\\n' in old:
         old_lf = old.replace('\\r\\n', '\\n')
         old_crlf = old_lf.replace('\\n', '\\r\\n')
         if old_lf in content:
             content = content.replace(old_lf, new)
         elif old_crlf in content:
             content = content.replace(old_crlf, new)
         else:
             print('Warning: could not find multiline target for:', old.split('\\n')[0])
    else:
         if old in content:
             content = content.replace(old, new)
         else:
             print('Warning: could not find target for:', old)

with open('client/src/pages/LandingPage.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
