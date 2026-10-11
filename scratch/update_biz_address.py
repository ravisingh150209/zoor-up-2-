import sys
sys.path.insert(0, '.')
from backend.database import get_collection

b_col = get_collection('businesses')
b_col.update_one(
    {'id': 'biz_8b17f1d06981'},
    {'$set': {
        'address': '123 Commercial Hub',
        'city': 'Mumbai',
        'state': 'Maharashtra',
        'postal_code': '400001'
    }}
)
print('Updated biz address successfully!')
