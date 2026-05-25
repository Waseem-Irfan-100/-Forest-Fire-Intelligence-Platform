import os
import requests

from django.http import JsonResponse

def fires(request):
    api_key = os.getenv("FIRMS_API_KEY")

    url = (f"https://firms.modaps.eosdis.nasa.gov/api/area/json/"
        f"{api_key}/VIIRS_SNPP_NRT/68,6,98,38/1")
    
    try:
        response = requests.get(url, timeout=10)
        response.raise_for_status()
        data = response.json()
        return JsonResponse(data, safe=False)
    
    except Exception as e:
        return JsonResponse({"error": str(e)}, status = 500)
