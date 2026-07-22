-- 010_vacation_photos.sql
-- Backfills real destination photos for the vacations deck (rows were seeded
-- with a NULL image_url, so SwipeCard fell back to the city emoji). Each URL is
-- a hotlinkable Wikimedia Commons Special:FilePath image, verified HTTP 200.
-- image_url already exists (001_schema.sql); this is a data-only backfill by title.

update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/London_Skyline_%28125508655%29.jpeg?width=800' where category = 'vacations' and title = 'London, England';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/La_Tour_Eiffel_vue_de_la_Tour_Saint-Jacques%2C_Paris_ao%C3%BBt_2014_%282%29.jpg?width=800' where category = 'vacations' and title = 'Paris, France';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Trevi_Fountain%2C_Rome%2C_Italy_2_-_May_2007.jpg?width=800' where category = 'vacations' and title = 'Rome, Italy';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Skyscrapers_of_Shinjuku_2009_January.jpg?width=800' where category = 'vacations' and title = 'Tokyo, Japan';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Evening_light_over_Barcelona.jpg?width=800' where category = 'vacations' and title = 'Barcelona, Spain';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lisboa_-_Portugal_%2852597836992%29.jpg?width=800' where category = 'vacations' and title = 'Lisbon, Portugal';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Water%20reflection%20of%20canal%20houses%20at%20blue%20hour%20in%20Damrak%20Amsterdam%20the%20Netherlands.jpg?width=800' where category = 'vacations' and title = 'Amsterdam, Netherlands';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Rice%20Paddies.%20Gunung%20Kawi%2C%20Bali%201626.jpg?width=800' where category = 'vacations' and title = 'Bali, Indonesia';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Dubai%20Skyline%20mit%20Burj%20Khalifa%20%2818241030269%29.jpg?width=800' where category = 'vacations' and title = 'Dubai, UAE';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Taormina%20towards%20SW%202024b.jpg?width=800' where category = 'vacations' and title = 'Sicily, Italy';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Kyoto%2C_Japan_%2849667780482%29.jpg?width=800' where category = 'vacations' and title = 'Kyoto, Japan';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Osaka_Castle_and_Osaka_Business_Park_skyscraper_20260610.jpg?width=800' where category = 'vacations' and title = 'Osaka, Japan';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Pavillon_Menarag%C3%A4rten.jpg?width=800' where category = 'vacations' and title = 'Marrakech, Morocco';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Historical_peninsula_and_modern_skyline_of_Istanbul.jpg?width=800' where category = 'vacations' and title = 'Istanbul, Turkey';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/1000%20Three%20domes%20of%20Oia%20in%20Santorini%20Photo%20by%20Giles%20Laurent.jpg?width=800' where category = 'vacations' and title = 'Santorini, Greece';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Prague_%286365119737%29.jpg?width=800' where category = 'vacations' and title = 'Prague, Czech Republic';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Schoenbrunn_philharmoniker_2012.jpg?width=800' where category = 'vacations' and title = 'Vienna, Austria';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Reykjav%C3%ADk%2C_view_from_Hallgr%C3%ADmskirkja_%282%29.jpg?width=800' where category = 'vacations' and title = 'Reykjavik, Iceland';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Queenstown_1_%288168013172%29.jpg?width=800' where category = 'vacations' and title = 'Queenstown, New Zealand';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Camps_bay_%2853460319478%29_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'Cape Town, South Africa';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Puerto_Madero%2C_Buenos_Aires_%2840689219792%29_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'Buenos Aires, Argentina';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cidade_Maravilhosa.jpg?width=800' where category = 'vacations' and title = 'Rio de Janeiro, Brazil';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/4Y1A1159_Bangkok_%2833536795515%29.jpg?width=800' where category = 'vacations' and title = 'Bangkok, Thailand';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Hanoi_skyline_with_Ba_Vi_Mountain.jpg?width=800' where category = 'vacations' and title = 'Hanoi, Vietnam';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Machu_Picchu%2C_2023_%28012%29.jpg?width=800' where category = 'vacations' and title = 'Machu Picchu, Peru';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Moraine_Lake_17092005.jpg?width=800' where category = 'vacations' and title = 'Banff, Canada';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Sobrevuelos_CDMX_HJ2A4913_%2825514321687%29_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'Mexico City, Mexico';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Tulum_2.jpg?width=800' where category = 'vacations' and title = 'Tulum, Mexico';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/View_of_Empire_State_Building_from_Rockefeller_Center_New_York_City_dllu_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'New York City, USA';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/New_Orleans_from_the_Air_September_2019_-_Central_Business_District_Skyline_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'New Orleans, Louisiana';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/East_Battery_Street_Charleston_Aug2010.jpg?width=800' where category = 'vacations' and title = 'Charleston, South Carolina';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Savannah%2C%20GA%20-%20Historic%20District%20%283%29.jpg?width=800' where category = 'vacations' and title = 'Savannah, Georgia';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/San_Francisco_Downtown_Aerial%2C_August_2025.jpg?width=800' where category = 'vacations' and title = 'San Francisco, California';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Starr-170222-0871-Cocos%20nucifera-coast%20beach%20umbrellas-Wailea%20Coastal%20Walk-Maui%20%2833380936095%29.jpg?width=800' where category = 'vacations' and title = 'Maui, Hawaii';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cathedral_Rock_-_Sedona_AZ-1.jpg?width=800' where category = 'vacations' and title = 'Sedona, Arizona';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Canyon_River_Tree_%28165872763%29.jpeg?width=800' where category = 'vacations' and title = 'Grand Canyon, Arizona';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Grand_Canyon_of_yellowstone.jpg?width=800' where category = 'vacations' and title = 'Yellowstone, Wyoming';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Half_Dome_with_Eastern_Yosemite_Valley_%2850MP%29.jpg?width=800' where category = 'vacations' and title = 'Yosemite, California';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Downtown_of_Aspen%2C_Colorado.jpg?width=800' where category = 'vacations' and title = 'Aspen, Colorado';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Southernmost_point_buoy%2C_NE_view.jpg?width=800' where category = 'vacations' and title = 'Key West, Florida';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Nashville%2C_TN_skyline.jpg?width=800' where category = 'vacations' and title = 'Nashville, Tennessee';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Asheville_at_dusk_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'Asheville, North Carolina';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/La_Jolla_Shores_view_%28cropped%29.jpg?width=800' where category = 'vacations' and title = 'San Diego, California';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Portland_Oregon_Aerial%2C_June_2025.jpg?width=800' where category = 'vacations' and title = 'Portland, Oregon';
update items set image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lake-sherburne-964855.jpg?width=800' where category = 'vacations' and title = 'Glacier National Park, Montana';
