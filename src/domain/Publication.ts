export interface PublicationImage {
  mimetype: string;
  data: string;
  filename?: string;
  caption?: string;
}

export class Publication {
  readonly id: string;
  name: string;
  text: string;
  readonly images: PublicationImage[];

  constructor(id: string, name: string, text: string, images: PublicationImage[] = []) {
    this.id = id;
    this.name = name;
    this.text = text;
    this.images = images;
  }

  addImage(image: PublicationImage): void {
    this.images.push(image);
  }

  hasImages(): boolean {
    return this.images.length > 0;
  }
}
