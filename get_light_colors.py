import re

with open('light_dashboard.html', 'r', encoding='utf-8') as f:
    html = f.read()

classes = set(re.findall(r'class="([^"]+)"', html))
all_classes = []
for c in classes:
    all_classes.extend(c.split())

color_classes = sorted(list(set([c for c in all_classes if c.startswith('bg-') or c.startswith('text-') or c.startswith('border-')])))
print("Unique Tailwind classes in light_dashboard.html:")
for c in color_classes:
    print(f"  {c}")
