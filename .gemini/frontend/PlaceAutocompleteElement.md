This example adds an Autocomplete widget to a web page, and displays the results for each selected place.

```
async function init(): Promise<void> {
    // Request needed libraries.
    // @ts-expect-error - when this gets addressed also remove the global eslint-disables above
    const { PlaceAutocompleteElement } =
        await google.maps.importLibrary('places');
    // Create the input HTML element, and append it.
    const placeAutocomplete = new PlaceAutocompleteElement();
    document.body.appendChild(placeAutocomplete);

    // Inject HTML UI.
    const selectedPlaceTitle = document.createElement('p');
    selectedPlaceTitle.textContent = '';
    document.body.appendChild(selectedPlaceTitle);

    const selectedPlaceInfo = document.createElement('pre');
    selectedPlaceInfo.textContent = '';
    document.body.appendChild(selectedPlaceInfo);

    // Add the gmp-select listener, and display the results.
    placeAutocomplete.addEventListener(
        'gmp-select',
        async ({
            placePrediction,
        }: google.maps.places.PlacePredictionSelectEvent) => {
            const place = placePrediction.toPlace();
            await place.fetchFields({
                fields: ['displayName', 'formattedAddress', 'location'],
            });
            selectedPlaceTitle.textContent = 'Selected Place:';
            selectedPlaceInfo.textContent = JSON.stringify(
                place.toJSON(),
                /* replacer */ null,
                /* space */ 2
            );
        }
    );
}

void init();
```

Restrict place search to map bounds

```
// Use the bounds_changed event to restrict results to the current map bounds.
google.maps.event.addListener(innerMap, 'bounds_changed', async () => {
    placeAutocomplete.locationRestriction = innerMap.getBounds();
});
```

Bias place search results

```
placeAutocomplete.locationBias = {radius: 100, center: {lat: 40.749933, lng: -73.98633}};
```

Restrict place search results to certain types
```
const autocomplete = new google.maps.places.PlaceAutocompleteElement({
  includedPrimaryTypes: ['establishment'],
});
```

#### Constrain Autocomplete predictions
By default, Place Autocomplete presents all place types, biased for predictions near the user's location, and fetches all available data fields for the user's selected place. Set PlaceAutocompleteElementOptions to present more relevant predictions, by restricting or biasing results.

Restricting results causes the Autocomplete widget to ignore any results that are outside of the restriction area. A common practice is to restrict results to the map bounds. Biasing results makes the Autocomplete widget show results within the specified area, but some matches may be outside of that area.

If you don't supply any bounds or a map viewport, the API will attempt to detect the user's location from their IP address, and will bias the results to that location. Set a bounds whenever possible. Otherwise, different users may receive different predictions. Also, to generally improve predictions it is important to provide a sensible viewport such as one that you set by panning or zooming on the map, or a developer-set viewport based on device location and radius. When a radius is not available, 5 km is considered a sensible default for Place Autocomplete. Don't set a viewport with zero radius (a single point), a viewport that is only a few meters across (less than 100 meters), or a viewport that spans the globe.

