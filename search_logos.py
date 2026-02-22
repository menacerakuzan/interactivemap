import urllib.request
import json
import ssl

ctx = ssl.create_default_context()
ctx.check_hostname = False
ctx.verify_mode = ssl.CERT_NONE

def search_wiki(query):
    url = f"https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch={urllib.parse.quote(query)}&utf8=&format=json"
    req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
    try:
        response = urllib.request.urlopen(req, context=ctx)
        data = json.loads(response.read())
        return [item['title'] for item in data['query']['search'][:3]]
    except Exception as e:
        return str(e)

print("Odessa Oblast:", search_wiki("Coat of Arms of Odesa Oblast svg"))
print("Odessa City:", search_wiki("Coat of Arms of Odesa svg"))
print("Minregion:", search_wiki("Ministry of Communities and Territories Development Ukraine logo"))

